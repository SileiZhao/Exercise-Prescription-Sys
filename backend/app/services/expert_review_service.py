from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import utcnow
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate
from app.services.health_profile_service import HealthProfileService
from app.services.audit_service import AuditService


class ExpertReviewService:
    def __init__(self, db: Session):
        self.db = db
        self.audit = AuditService(db)

    def list_queue(self) -> list[dict[str, Any]]:
        records = list(
            self.db.scalars(
                select(PrescriptionRecord)
                .where(PrescriptionRecord.status.in_(["PENDING_REVIEW", "REFERRED"]))
                .order_by(PrescriptionRecord.created_at.asc())
            )
        )
        queue: list[dict[str, Any]] = []
        for record in records:
            review = self._get_or_create_review(record)
            queue.append(
                {
                    "prescription_id": record.id,
                    "user_id": record.user_id,
                    "risk_level": record.risk_level,
                    "status": record.status,
                    "version": record.version,
                    "created_at": record.created_at,
                    "review_id": review.id,
                }
            )
        self.db.commit()
        return queue

    def detail(self, prescription_id: int) -> dict[str, Any]:
        record = self.db.get(PrescriptionRecord, prescription_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="处方不存在")
        review = self._get_or_create_review(record)
        template_payload = None
        if record.template_id is not None:
            template = self.db.get(PrescriptionTemplate, record.template_id)
            if template is not None:
                template_payload = {
                    "id": template.id,
                    "name": template.name,
                    "risk_level": template.risk_level,
                    "cluster_tags": template.cluster_tags or [],
                    "goal_tags": template.goal_tags or [],
                    "fitt_vp": template.fitt_vp,
                    "precautions": template.precautions or [],
                    "contraindications": template.contraindications or [],
                    "evidence_refs": template.evidence_refs or [],
                }
        return {
            "prescription": record,
            "review": review,
            "health_snapshot": HealthProfileService(self.db).latest_snapshot(record.user_id),
            "risk_rules": (record.llm_payload or {}).get("risk_rules") or [],
            "evidence_refs": record.evidence_refs or [],
            "template": template_payload,
            "candidate_actions": (record.llm_payload or {}).get("candidate_actions") or [],
        }

    def approve(
        self,
        prescription_id: int,
        expert_id: int,
        review_comment: str,
        edited_prescription: dict[str, Any],
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        if record.status == "REFERRED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="转介处方不能批准为训练处方",
            )

        review = self._get_or_create_review(record)
        review.expert_id = expert_id
        review.status = "APPROVED"
        review.action = "APPROVE"
        review.review_comment = review_comment
        review.edited_prescription = edited_prescription
        review.reviewed_at = utcnow()

        self._apply_edit(record, edited_prescription)
        record.status = "PUBLISHED"
        record.expert_review_required = False
        record.version += 1
        record.updated_at = utcnow()
        self.db.add(
            PrescriptionVersion(
                prescription_id=record.id,
                version=record.version,
                snapshot=self._version_snapshot(record),
                change_reason="EXPERT_APPROVE",
                actor_id=expert_id,
            )
        )
        self.audit.record(
            action="EXPERT_APPROVE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=expert_id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def reject(
        self,
        prescription_id: int,
        expert_id: int,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        review.expert_id = expert_id
        review.status = "REJECTED"
        review.action = "REJECT"
        review.review_comment = review_comment
        review.reviewed_at = utcnow()
        record.status = "REJECTED"
        record.updated_at = utcnow()
        self.audit.record(
            action="EXPERT_REJECT_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=expert_id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def refer(
        self,
        prescription_id: int,
        expert_id: int,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        review.expert_id = expert_id
        review.status = "REFERRED"
        review.action = "REFER"
        review.review_comment = review_comment
        review.reviewed_at = utcnow()
        record.status = "REFERRED"
        record.fitt_vp = None
        record.expert_review_required = True
        record.safety_notice = review_comment
        record.updated_at = utcnow()
        self.audit.record(
            action="EXPERT_REFER_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=expert_id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def _get_reviewable_record(self, prescription_id: int) -> PrescriptionRecord:
        record = self.db.get(PrescriptionRecord, prescription_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="处方不存在")
        if record.status not in {"PENDING_REVIEW", "REFERRED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="处方不在审核队列")
        return record

    def _get_or_create_review(self, record: PrescriptionRecord) -> ExpertReview:
        review = self.db.scalar(select(ExpertReview).where(ExpertReview.prescription_id == record.id))
        if review is not None:
            return review
        review = ExpertReview(
            prescription_id=record.id,
            user_id=record.user_id,
            status="PENDING",
            edited_prescription={},
        )
        self.db.add(review)
        self.db.flush()
        return review

    def _apply_edit(self, record: PrescriptionRecord, edit: dict[str, Any]) -> None:
        for key in ["fitt_vp", "precautions", "contraindications", "reassessment", "safety_notice"]:
            if key in edit:
                setattr(record, key, edit[key])

    def _version_snapshot(self, record: PrescriptionRecord) -> dict[str, Any]:
        return {
            "risk_level": record.risk_level,
            "cluster_label": record.cluster_label,
            "goals": record.goals,
            "fitt_vp": record.fitt_vp,
            "precautions": record.precautions,
            "contraindications": record.contraindications,
            "reassessment": record.reassessment,
            "status": record.status,
            "version": record.version,
            "updated_at": utcnow().isoformat(),
        }
