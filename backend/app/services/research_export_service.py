from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.cluster import UserClusterAssignment
from app.models.health_data import ExerciseFeedback, FitnessTest, RiskScreening, UserProfile
from app.models.prescription import PrescriptionRecord


class ResearchExportService:
    def __init__(self, db: Session):
        self.db = db

    def export_users(self) -> dict[str, Any]:
        profiles = list(self.db.scalars(select(UserProfile).order_by(UserProfile.user_id.asc())))
        items = [self._row(profile) for profile in profiles]
        return {"items": items, "total": len(items)}

    def summary(self) -> dict[str, Any]:
        feedback_count = self.db.scalar(select(func.count(ExerciseFeedback.id))) or 0
        avg_completion = self.db.scalar(select(func.avg(ExerciseFeedback.completion_rate))) or 0
        avg_rpe = self.db.scalar(select(func.avg(ExerciseFeedback.rpe))) or 0
        discomfort_event_count = (
            len([item for item in self.db.scalars(select(ExerciseFeedback.discomfort)).all() if item])
            if feedback_count
            else 0
        )
        pain_worsened_count = (
            self.db.scalar(
                select(func.count(ExerciseFeedback.id)).where(ExerciseFeedback.pain_score_after >= 4)
            )
            or 0
        )
        return {
            "total_participants": self.db.scalar(select(func.count(UserProfile.id))) or 0,
            "risk_distribution": self._distribution(RiskScreening.risk_level),
            "cluster_distribution": self._latest_cluster_distribution(),
            "prescription_status": self._distribution(PrescriptionRecord.status),
            "intervention_effects": {
                "feedback_count": feedback_count,
                "average_completion_rate": round(float(avg_completion), 2),
                "average_rpe": round(float(avg_rpe), 2),
                "discomfort_event_count": discomfort_event_count,
                "pain_worsened_count": pain_worsened_count,
            },
        }

    def _distribution(self, column) -> dict[str, int]:
        rows = self.db.execute(
            select(column, func.count()).where(column.is_not(None)).group_by(column)
        ).all()
        return {str(key): int(count) for key, count in rows if key}

    def _latest_cluster_distribution(self) -> dict[str, int]:
        assignments = self.db.scalars(
            select(UserClusterAssignment).order_by(
                UserClusterAssignment.user_id.asc(),
                UserClusterAssignment.created_at.desc(),
                UserClusterAssignment.id.desc(),
            )
        ).all()
        latest_by_user: dict[int, UserClusterAssignment] = {}
        for assignment in assignments:
            latest_by_user.setdefault(assignment.user_id, assignment)
        distribution: dict[str, int] = {}
        for assignment in latest_by_user.values():
            label = assignment.cluster_label or "未分型"
            distribution[label] = distribution.get(label, 0) + 1
        return distribution

    def _row(self, profile: UserProfile) -> dict[str, Any]:
        return {
            "participant_code": f"P{profile.user_id:06d}",
            "profile": {
                "age": profile.age,
                "sex": profile.sex,
                "height_cm": profile.height_cm,
                "weight_kg": profile.weight_kg,
                "bmi": profile.bmi,
                "waist_cm": profile.waist_cm,
                "whr": profile.whr,
                "exercise_goal": profile.exercise_goal,
                "exercise_habit": profile.exercise_habit,
                "exercise_experience": profile.exercise_experience,
            },
            "fitness_test": self._fitness(profile.user_id),
            "risk_screening": self._risk(profile.user_id),
            "latest_prescription": self._prescription(profile.user_id),
        }

    def _fitness(self, user_id: int) -> dict[str, Any] | None:
        record = self.db.scalar(
            select(FitnessTest).where(FitnessTest.user_id == user_id).order_by(FitnessTest.measured_at.desc()).limit(1)
        )
        if record is None:
            return None
        return {
            "resting_hr": record.resting_hr,
            "sbp": record.sbp,
            "dbp": record.dbp,
            "vital_capacity": record.vital_capacity,
            "grip_left": record.grip_left,
            "grip_right": record.grip_right,
            "sit_reach": record.sit_reach,
            "single_leg_stand": record.single_leg_stand,
            "pain_score": record.pain_score,
            "measured_at": record.measured_at.isoformat(),
        }

    def _risk(self, user_id: int) -> dict[str, Any] | None:
        record = self.db.scalar(
            select(RiskScreening)
            .where(RiskScreening.user_id == user_id)
            .order_by(RiskScreening.created_at.desc())
            .limit(1)
        )
        if record is None:
            return None
        return {
            "has_hypertension": record.has_hypertension,
            "has_diabetes": record.has_diabetes,
            "has_chd": record.has_chd,
            "has_joint_pain": record.has_joint_pain,
            "risk_level": record.risk_level,
            "risk_reasons": record.risk_reasons,
        }

    def _prescription(self, user_id: int) -> dict[str, Any] | None:
        record = self.db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.created_at.desc())
            .limit(1)
        )
        if record is None:
            return None
        return {
            "risk_level": record.risk_level,
            "cluster_label": record.cluster_label,
            "goals": record.goals,
            "status": record.status,
            "version": record.version,
            "expert_review_required": record.expert_review_required,
        }
