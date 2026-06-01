from html import escape
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health_data import UserProfile
from app.models.prescription import PrescriptionRecord, ReportExportRecord
from app.models.review import ExpertReview
from app.schemas.report import ReportExportRecordList, ReportExportRecordRead
from app.services.audit_service import AuditService
from app.services.feedback_adjustment_service import FeedbackAdjustmentService


DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MEDIA_TYPE = "application/pdf"


class PrescriptionReportService:
    def __init__(self, db: Session):
        self.db = db
        self.audit = AuditService(db)

    def build_docx(self, prescription_id: int, requester_id: int) -> tuple[str, bytes]:
        filename, paragraphs = self._prescription_report_paragraphs(prescription_id, requester_id, "docx")
        content = self._docx_bytes(paragraphs)
        self._record_prescription_export(prescription_id, requester_id, "docx", filename)
        return filename, content

    def build_pdf(self, prescription_id: int, requester_id: int) -> tuple[str, bytes]:
        filename, paragraphs = self._prescription_report_paragraphs(prescription_id, requester_id, "pdf")
        content = self._pdf_bytes(paragraphs)
        self._record_prescription_export(prescription_id, requester_id, "pdf", filename)
        return filename, content

    def _prescription_report_paragraphs(
        self,
        prescription_id: int,
        requester_id: int,
        extension: str,
    ) -> tuple[str, list[str]]:
        prescription = self.db.get(PrescriptionRecord, prescription_id)
        if prescription is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="处方不存在")
        if prescription.user_id != requester_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

        profile = self.db.scalar(select(UserProfile).where(UserProfile.user_id == prescription.user_id))
        review = self.db.scalar(
            select(ExpertReview)
            .where(ExpertReview.prescription_id == prescription.id)
            .order_by(ExpertReview.reviewed_at.desc().nullslast(), ExpertReview.created_at.desc())
            .limit(1)
        )
        paragraphs = self._paragraphs(prescription, profile, review)
        filename = f"prescription-{prescription.id}-v{prescription.version}.{extension}"
        return filename, paragraphs

    def build_phase_assessment_docx(
        self,
        requester_id: int,
        weeks: int = 4,
        prescription_id: int | None = None,
    ) -> tuple[str, bytes]:
        filename, paragraphs, audit_metadata = self._phase_assessment_paragraphs(
            user_id=requester_id,
            prescription_id=prescription_id,
            weeks=weeks,
        )
        content = self._docx_bytes(paragraphs)
        self._record_phase_assessment_export(requester_id, "docx", filename, audit_metadata)
        return filename, content

    def build_phase_assessment_pdf(
        self,
        requester_id: int,
        weeks: int = 4,
        prescription_id: int | None = None,
    ) -> tuple[str, bytes]:
        filename, paragraphs, audit_metadata = self._phase_assessment_paragraphs(
            user_id=requester_id,
            prescription_id=prescription_id,
            weeks=weeks,
            extension="pdf",
        )
        content = self._pdf_bytes(paragraphs)
        self._record_phase_assessment_export(requester_id, "pdf", filename, audit_metadata)
        return filename, content

    def _phase_assessment_paragraphs(
        self,
        user_id: int,
        prescription_id: int | None,
        weeks: int,
        extension: str = "docx",
    ) -> tuple[str, list[str], dict[str, object]]:
        assessment = FeedbackAdjustmentService(self.db).phase_assessment(
            user_id=user_id,
            prescription_id=prescription_id,
            weeks=weeks,
        )
        prescription = None
        if assessment.prescription_id is not None:
            prescription = self.db.get(PrescriptionRecord, assessment.prescription_id)
        paragraphs = [
            "阶段评估报告",
            "处方摘要",
            f"处方编号：{prescription.id if prescription else '-'}",
            f"风险等级：{prescription.risk_level if prescription else '-'}",
            f"分型：{prescription.cluster_label if prescription else '-'}",
            "评估摘要",
            assessment.summary,
            "关键指标",
            f"评估周期：{assessment.weeks}周",
            f"打卡次数：{assessment.feedback_count}次",
            f"平均完成率：{assessment.average_completion_rate}%",
            f"平均RPE：{assessment.average_rpe}",
            f"疼痛事件：{assessment.pain_events}次",
            f"不适事件：{assessment.discomfort_events}次",
            f"红色预警：{assessment.red_alert_events}次",
            f"评估结论：{assessment.decision}",
            "下一阶段建议",
            *assessment.recommendations,
            "免责声明",
            "本阶段报告用于运动健康服务的过程评估和处方调整参考，不替代医疗诊断、药物治疗或临床处置；如出现红色预警信号，应立即停止训练并寻求医学评估。",
        ]
        suffix = f"prescription-{prescription_id}" if prescription_id is not None else "current-user"
        filename = f"phase-assessment-{suffix}-{weeks}w.{extension}"
        audit_metadata = {
            "weeks": assessment.weeks,
            "prescription_id": assessment.prescription_id,
            "feedback_count": assessment.feedback_count,
            "decision": assessment.decision,
        }
        return filename, paragraphs, audit_metadata

    def _record_prescription_export(
        self,
        prescription_id: int,
        requester_id: int,
        export_format: str,
        filename: str,
    ) -> None:
        prescription = self.db.get(PrescriptionRecord, prescription_id)
        if prescription is None:
            return
        self.audit.record(
            action="EXPORT_PRESCRIPTION_REPORT",
            resource_type="PrescriptionRecord",
            resource_id=str(prescription.id),
            actor_id=requester_id,
            metadata={
                "format": export_format,
                "filename": filename,
                "risk_level": prescription.risk_level,
                "status": prescription.status,
                "version": prescription.version,
            },
        )
        self.db.commit()
        self._record_report_export(
            user_id=prescription.user_id,
            exported_by=requester_id,
            prescription_id=prescription.id,
            report_type="PRESCRIPTION",
            export_format=export_format,
            filename=filename,
            risk_level=prescription.risk_level,
            record_status=prescription.status,
            version=prescription.version,
            metadata={
                "audit_action": "EXPORT_PRESCRIPTION_REPORT",
                "expert_review_required": prescription.expert_review_required,
            },
        )

    def _record_phase_assessment_export(
        self,
        requester_id: int,
        export_format: str,
        filename: str,
        metadata: dict[str, object],
    ) -> None:
        prescription = None
        prescription_id = metadata.get("prescription_id")
        if isinstance(prescription_id, int):
            prescription = self.db.get(PrescriptionRecord, prescription_id)
        self.audit.record(
            action="EXPORT_PHASE_ASSESSMENT_REPORT",
            resource_type="PhaseAssessment",
            resource_id=str(requester_id),
            actor_id=requester_id,
            metadata={
                **metadata,
                "format": export_format,
                "filename": filename,
            },
        )
        self.db.commit()
        self._record_report_export(
            user_id=requester_id,
            exported_by=requester_id,
            prescription_id=prescription.id if prescription else None,
            report_type="PHASE_ASSESSMENT",
            export_format=export_format,
            filename=filename,
            risk_level=prescription.risk_level if prescription else None,
            record_status=prescription.status if prescription else None,
            version=prescription.version if prescription else None,
            metadata={
                **metadata,
                "audit_action": "EXPORT_PHASE_ASSESSMENT_REPORT",
            },
        )

    def _record_report_export(
        self,
        user_id: int,
        exported_by: int,
        prescription_id: int | None,
        report_type: str,
        export_format: str,
        filename: str,
        risk_level: str | None,
        record_status: str | None,
        version: int | None,
        metadata: dict[str, object],
    ) -> None:
        self.db.add(
            ReportExportRecord(
                user_id=user_id,
                exported_by=exported_by,
                prescription_id=prescription_id,
                report_type=report_type,
                format=export_format,
                filename=filename,
                risk_level=risk_level,
                status=record_status,
                version=version,
                metadata_json=metadata,
            )
        )
        self.db.commit()

    def list_exports_for_user(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> ReportExportRecordList:
        return self._list_export_records(user_id=user_id, limit=limit, offset=offset)

    def list_all_exports(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> ReportExportRecordList:
        return self._list_export_records(user_id=None, limit=limit, offset=offset)

    def _list_export_records(
        self,
        user_id: int | None,
        limit: int,
        offset: int,
    ) -> ReportExportRecordList:
        limit = max(1, min(limit, 200))
        offset = max(0, offset)
        filters = []
        if user_id is not None:
            filters.append(ReportExportRecord.user_id == user_id)
        total = self.db.scalar(select(func.count(ReportExportRecord.id)).where(*filters)) or 0
        records = self.db.scalars(
            select(ReportExportRecord)
            .where(*filters)
            .order_by(ReportExportRecord.created_at.desc(), ReportExportRecord.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return ReportExportRecordList(
            total=total,
            items=[
                ReportExportRecordRead(
                    id=record.id,
                    user_id=record.user_id,
                    exported_by=record.exported_by,
                    prescription_id=record.prescription_id,
                    report_type=record.report_type,
                    format=record.format,
                    filename=record.filename,
                    risk_level=record.risk_level,
                    status=record.status,
                    version=record.version,
                    metadata=record.metadata_json or {},
                    created_at=record.created_at,
                )
                for record in records
            ],
        )

    def _paragraphs(
        self,
        prescription: PrescriptionRecord,
        profile: UserProfile | None,
        review: ExpertReview | None,
    ) -> list[str]:
        fitt_vp = prescription.fitt_vp or {}
        exercise_type = fitt_vp.get("type", [])
        if isinstance(exercise_type, list):
            exercise_type_text = "、".join(str(item) for item in exercise_type)
        else:
            exercise_type_text = str(exercise_type or "-")
        evidence = prescription.evidence_refs or []
        evidence_text = "；".join(
            str(item.get("title") or item.get("source") or item) if isinstance(item, dict) else str(item)
            for item in evidence
        )
        risk_rules = self._risk_rule_text(prescription)
        return [
            "个性化运动处方报告",
            "用户摘要",
            f"姓名：{profile.name if profile else '-'}",
            f"性别：{profile.sex if profile else '-'}",
            f"年龄：{profile.age if profile else '-'}",
            f"BMI：{profile.bmi if profile else '-'}",
            f"运动目标：{'、'.join(prescription.goals or []) or '-'}",
            "风险与分型",
            f"风险等级：{prescription.risk_level}",
            "命中风险规则",
            risk_rules or "-",
            f"分型：{prescription.cluster_label or '-'}",
            f"状态：{prescription.status}",
            "FITT-VP",
            f"频率 Frequency：{fitt_vp.get('frequency', 'R3转介或暂未生成训练频率')}",
            f"强度 Intensity：{fitt_vp.get('intensity', 'R3转介或暂未生成训练强度')}",
            f"时间 Time：{fitt_vp.get('time', 'R3转介或暂未生成训练时间')}",
            f"类型 Type：{exercise_type_text}",
            f"总量 Volume：{fitt_vp.get('volume', '-')}",
            f"进阶 Progression：{fitt_vp.get('progression', '-')}",
            f"注意事项：{'、'.join(prescription.precautions or []) or '-'}",
            f"禁忌动作/限制：{'、'.join(prescription.contraindications or []) or '-'}",
            f"复测周期：{prescription.reassessment}",
            f"安全提醒：{prescription.safety_notice or '运动中如出现胸痛、胸闷、头晕、晕厥、严重气短或明显疼痛，请立即停止并寻求医学评估。'}",
            "知识依据",
            evidence_text or "-",
            "专家审核",
            self._review_text(review),
            "免责声明",
            "本报告用于运动健康指导和风险提示，不替代医疗诊断、药物治疗或临床处置；R3高风险用户不得依据本报告自行开展训练。",
        ]

    def _risk_rule_text(self, prescription: PrescriptionRecord) -> str:
        rules = (prescription.llm_payload or {}).get("risk_rules") or []
        texts: list[str] = []
        for rule in rules:
            if isinstance(rule, dict):
                parts = [
                    str(rule.get("rule_id") or rule.get("code") or "").strip(),
                    str(rule.get("message") or rule.get("description") or rule.get("reason") or "").strip(),
                    str(rule.get("risk_level") or "").strip(),
                ]
                text = " ".join(part for part in parts if part)
            else:
                text = str(rule)
            if text:
                texts.append(text)
        return "；".join(texts)

    def _review_text(self, review: ExpertReview | None) -> str:
        if review is None:
            return "未记录专家审核意见或为自动发布处方。"
        parts = [
            f"审核状态：{review.status}",
            f"审核动作：{review.action}",
        ]
        if review.review_comment:
            parts.append(f"审核意见：{review.review_comment}")
        return "；".join(parts)

    def _docx_bytes(self, paragraphs: list[str]) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w", ZIP_DEFLATED) as docx:
            docx.writestr("[Content_Types].xml", self._content_types_xml())
            docx.writestr("_rels/.rels", self._rels_xml())
            docx.writestr("word/document.xml", self._document_xml(paragraphs))
            docx.writestr("word/_rels/document.xml.rels", self._document_rels_xml())
        return buffer.getvalue()

    def _pdf_bytes(self, paragraphs: list[str]) -> bytes:
        report_text = "\n".join(paragraphs)
        pages = [self._pdf_page_stream(lines) for lines in self._pdf_paginate(paragraphs)]
        objects: list[bytes] = [b"", b"", b"", b""]
        page_ids: list[int] = []
        for stream in pages:
            content_id = self._append_pdf_object(
                objects,
                b"<< /Length "
                + str(len(stream)).encode("ascii")
                + b" >>\nstream\n"
                + stream
                + b"\nendstream",
            )
            page_id = self._append_pdf_object(
                objects,
                (
                    f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                    f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
                ).encode("ascii"),
            )
            page_ids.append(page_id)
        objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
        kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
        objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
        objects[2] = b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>"
        objects[3] = (
            b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
            b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>"
        )
        buffer = BytesIO()
        buffer.write(b"%PDF-1.4\n")
        for line in report_text.splitlines():
            buffer.write(("% " + line.replace("\r", " ")).encode("utf-8") + b"\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(buffer.tell())
            buffer.write(f"{index} 0 obj\n".encode("ascii"))
            buffer.write(obj)
            buffer.write(b"\nendobj\n")
        xref_offset = buffer.tell()
        buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        buffer.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            buffer.write(f"{offset:010d} 00000 n \n".encode("ascii"))
        buffer.write(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF\n"
            ).encode("ascii")
        )
        return buffer.getvalue()

    def _append_pdf_object(self, objects: list[bytes], obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    def _pdf_paginate(self, paragraphs: list[str]) -> list[list[str]]:
        lines: list[str] = []
        for paragraph in paragraphs:
            lines.extend(self._wrap_pdf_line(paragraph))
        page_size = 38
        return [lines[index : index + page_size] for index in range(0, len(lines), page_size)] or [[""]]

    def _wrap_pdf_line(self, text: str, width: int = 34) -> list[str]:
        if not text:
            return [""]
        return [text[index : index + width] for index in range(0, len(text), width)]

    def _pdf_page_stream(self, lines: list[str]) -> bytes:
        commands = ["BT", "/F1 11 Tf", "1 0 0 1 50 790 Tm"]
        for index, line in enumerate(lines):
            if index > 0:
                commands.append("0 -18 Td")
            commands.append(f"<{self._pdf_text_hex(line)}> Tj")
        commands.append("ET")
        return "\n".join(commands).encode("ascii")

    def _pdf_text_hex(self, text: str) -> str:
        return text.encode("utf-16-be").hex().upper()

    def _document_xml(self, paragraphs: list[str]) -> str:
        body = "".join(
            f"<w:p><w:r><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"
            for text in paragraphs
        )
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{body}<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/>"
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
            "</w:sectPr></w:body></w:document>"
        )

    def _content_types_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>"
        )

    def _rels_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>'
            "</Relationships>"
        )

    def _document_rels_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
        )
