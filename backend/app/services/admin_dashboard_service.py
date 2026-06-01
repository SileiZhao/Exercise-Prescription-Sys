from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus
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
            "cluster_distribution": self._group_count(PrescriptionRecord.cluster_label, skip_empty=True),
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
