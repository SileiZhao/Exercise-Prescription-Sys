from collections import Counter

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.core.config import runtime_provider_summary, settings
from app.core.readiness import ReadinessService
from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord
from app.models.review import ExpertReview
from app.models.risk import RiskRuleConfig
from app.models.template import (
    ActionReviewStatus,
    ExerciseAction,
    KnowledgeChunk,
    KnowledgeDocument,
    ComplianceDocument,
    PrescriptionTemplate,
    TemplateStatus,
)
from app.models.user import User


class AdminDashboardService:
    def __init__(self, db: Session):
        self.db = db

    def summary(self) -> dict:
        r2_total = self._count_prescriptions(risk_level="R2")
        r2_reviewed = self.db.scalar(
            select(func.count(func.distinct(ExpertReview.prescription_id))).join(
                PrescriptionRecord,
                PrescriptionRecord.id == ExpertReview.prescription_id,
            ).where(PrescriptionRecord.risk_level == "R2")
        ) or 0
        feedback_total = self.db.scalar(select(func.count(ExerciseFeedback.id))) or 0
        avg_completion = self.db.scalar(select(func.avg(ExerciseFeedback.completion_rate))) or 0

        return {
            "total_users": self.db.scalar(select(func.count(User.id))) or 0,
            "users_by_role": self._group_count(User.role),
            "risk_distribution": self._group_count(PrescriptionRecord.risk_level),
            "prescription_status": self._group_count(PrescriptionRecord.status),
            "review_stats": self._normalise_review_stats(self._group_count(ExpertReview.status)),
            "r2_review_rate": round(r2_reviewed / r2_total, 4) if r2_total else 0,
            "r3_referral_count": self._count_prescriptions(risk_level="R3", status="REFERRED"),
            "feedback_stats": {
                "total": feedback_total,
                "average_completion_rate": round(float(avg_completion), 2),
            },
            "template_usage": {
                "total_templates": self.db.scalar(select(func.count(PrescriptionTemplate.id))) or 0,
                "approved_templates": self.db.scalar(
                    select(func.count(PrescriptionTemplate.id)).where(
                        PrescriptionTemplate.status == TemplateStatus.APPROVED
                    )
                )
                or 0,
            },
            "prescription_trend": self._prescription_trend(),
            "rule_hit_rank": self._rule_hit_rank(),
            "template_usage_rank": self._template_usage_rank(),
            "cluster_distribution": self._group_count(PrescriptionRecord.cluster_label, skip_empty=True),
            "reference_data_status": self._reference_data_status(),
        }

    def _prescription_trend(self) -> list[dict[str, int | str]]:
        published_count = func.sum(case((PrescriptionRecord.status == "PUBLISHED", 1), else_=0))
        rows = self.db.execute(
            select(
                func.date(PrescriptionRecord.created_at),
                func.count(PrescriptionRecord.id),
                published_count,
            )
            .group_by(func.date(PrescriptionRecord.created_at))
            .order_by(func.date(PrescriptionRecord.created_at).asc())
        ).all()
        return [
            {
                "date": str(day),
                "generated": int(generated or 0),
                "published": int(published or 0),
            }
            for day, generated, published in rows
        ]

    def _rule_hit_rank(self) -> list[dict[str, int | str]]:
        counter: Counter[str] = Counter()
        for payload in self.db.scalars(select(PrescriptionRecord.llm_payload)):
            for item in (payload or {}).get("risk_rules") or []:
                code = item.get("code") or item.get("rule") or item.get("name")
                if code:
                    counter[str(code)] += 1
        return [{"rule": rule, "count": count} for rule, count in counter.most_common(10)]

    def _template_usage_rank(self) -> list[dict[str, int | str]]:
        rows = self.db.execute(
            select(PrescriptionTemplate.name, func.count(PrescriptionRecord.id).label("usage_count"))
            .join(PrescriptionRecord, PrescriptionRecord.template_id == PrescriptionTemplate.id)
            .group_by(PrescriptionTemplate.name)
            .order_by(desc("usage_count"), PrescriptionTemplate.name.asc())
            .limit(10)
        ).all()
        return [{"template": name, "count": int(count)} for name, count in rows]

    def _reference_data_status(self) -> dict:
        provider = settings.LLM_PROVIDER.strip().lower()
        readiness = ReadinessService(settings=settings)
        llm_status = readiness.check_llm()
        embedding_status = readiness.check_embedding()
        ocr_status = readiness.check_ocr()
        runtime_summary = runtime_provider_summary(settings)
        production_ready = llm_status.status == "ok" and provider not in {
            "mock",
            "local-mock",
            "ollama",
            "gemma",
            "local",
        }
        approved_actions = self.db.scalar(
            select(func.count(ExerciseAction.id)).where(ExerciseAction.status == ActionReviewStatus.APPROVED)
        ) or 0
        pending_actions = self.db.scalar(
            select(func.count(ExerciseAction.id)).where(ExerciseAction.status == ActionReviewStatus.PENDING_REVIEW)
        ) or 0
        confirmed_compliance = self.db.scalar(
            select(func.count(ComplianceDocument.id)).where(ComplianceDocument.review_status == "CONFIRMED")
        ) or 0
        draft_compliance = self.db.scalar(
            select(func.count(ComplianceDocument.id)).where(ComplianceDocument.review_status != "CONFIRMED")
        ) or 0
        active_documents = self.db.scalar(
            select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.status == "ACTIVE")
        ) or 0
        skipped_documents = self.db.scalar(
            select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.status == "SKIPPED")
        ) or 0
        failed_documents = self.db.scalar(
            select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.status == "INDEX_FAILED")
        ) or 0
        active_chunk_count = self.db.scalar(
            select(func.count(KnowledgeChunk.id))
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeDocument.status == "ACTIVE")
        ) or 0
        active_indexed_chunk_count = self.db.scalar(
            select(func.count(KnowledgeChunk.id))
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(
                KnowledgeDocument.status == "ACTIVE",
                KnowledgeChunk.embedding_ref.is_not(None),
            )
        ) or 0
        local_llm_model = settings.LOCAL_LLM_MODEL or settings.LLM_MODEL
        llm_model = local_llm_model if provider in {"ollama", "gemma", "local"} else settings.LLM_MODEL
        return {
            "risk_rules": {
                "total": self.db.scalar(select(func.count(RiskRuleConfig.id))) or 0,
                "active": self.db.scalar(select(func.count(RiskRuleConfig.id)).where(RiskRuleConfig.is_active.is_(True))) or 0,
            },
            "actions": {
                "approved": approved_actions,
                "pending_review": pending_actions,
            },
            "approved_actions_count": approved_actions,
            "pending_actions_count": pending_actions,
            "compliance": {
                "confirmed": confirmed_compliance,
                "draft": draft_compliance,
            },
            "confirmed_compliance_count": confirmed_compliance,
            "draft_compliance_count": draft_compliance,
            "templates": {
                "total": self.db.scalar(select(func.count(PrescriptionTemplate.id))) or 0,
                "approved": self.db.scalar(
                    select(func.count(PrescriptionTemplate.id)).where(
                        PrescriptionTemplate.status == TemplateStatus.APPROVED
                    )
                )
                or 0,
            },
            "knowledge": {
                "documents": active_documents,
                "skipped_documents": skipped_documents,
                "failed_documents": failed_documents,
                "chunks": active_chunk_count,
                "indexed_chunks": active_indexed_chunk_count,
            },
            "rag_active_documents_count": active_documents,
            "rag_skipped_documents_count": skipped_documents,
            "rag_failed_documents_count": failed_documents,
            "llm": {
                "provider": runtime_summary["llm"]["provider"],
                "model": runtime_summary["llm"]["model"] or llm_model,
                "production_ready": production_ready,
                "status": llm_status.status,
            },
            "embedding": {
                "provider": settings.EMBEDDING_PROVIDER,
                "model": settings.EMBEDDING_MODEL,
                "production_ready": embedding_status.status == "ok" and settings.EMBEDDING_PROVIDER != "hash",
                "status": embedding_status.status,
            },
            "ocr": {
                "provider": settings.OCR_PROVIDER,
                "enabled": settings.OCR_ENABLED,
                "status": ocr_status.status,
            },
            "embedding_provider": settings.EMBEDDING_PROVIDER,
            "ocr_enabled": settings.OCR_ENABLED,
            "llm_provider": runtime_summary["llm"]["provider"],
            "ollama_ready": provider in {"ollama", "gemma", "local"} and llm_status.status == "ok",
        }

    def _group_count(self, column, skip_empty: bool = False) -> dict[str, int]:
        statement = select(column, func.count()).group_by(column)
        if skip_empty:
            statement = statement.where(column.is_not(None))
        rows = self.db.execute(statement).all()
        result: dict[str, int] = {}
        for key, count in rows:
            if key is None and skip_empty:
                continue
            if hasattr(key, "value"):
                key = key.value
            result[str(key)] = int(count)
        return result

    def _count_prescriptions(self, risk_level: str | None = None, status: str | None = None) -> int:
        statement = select(func.count(PrescriptionRecord.id))
        if risk_level is not None:
            statement = statement.where(PrescriptionRecord.risk_level == risk_level)
        if status is not None:
            statement = statement.where(PrescriptionRecord.status == status)
        return self.db.scalar(statement) or 0

    def _normalise_review_stats(self, stats: dict[str, int]) -> dict[str, int]:
        return {
            "pending": stats.get("PENDING", 0),
            "approved": stats.get("APPROVED", 0),
            "rejected": stats.get("REJECTED", 0),
            "referred": stats.get("REFERRED", 0),
        }
