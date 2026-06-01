from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.template import (
    ActionReviewStatus,
    ExerciseAction,
    PrescriptionTemplate,
    TemplateStatus,
)
from app.models.user import utcnow
from app.schemas.template import ExerciseActionCreate, ExerciseActionReview, PrescriptionTemplateCreate
from app.services.audit_service import AuditService


class ExerciseActionService:
    def __init__(self, db: Session):
        self.db = db

    def create_imported_action(self, payload: ExerciseActionCreate) -> ExerciseAction:
        action = ExerciseAction(
            **payload.model_dump(),
            status=ActionReviewStatus.PENDING_REVIEW,
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action

    def list_actions(self) -> list[ExerciseAction]:
        return list(self.db.scalars(select(ExerciseAction).order_by(ExerciseAction.id.desc())))

    def review_action(
        self,
        action_id: int,
        payload: ExerciseActionReview,
        reviewer_id: int,
    ) -> ExerciseAction | None:
        action = self.db.get(ExerciseAction, action_id)
        if action is None:
            return None
        action.status = payload.status
        action.reviewed_by = reviewer_id
        action.reviewed_at = utcnow()
        AuditService(self.db).record(
            action="REVIEW_EXERCISE_ACTION",
            resource_type="ExerciseAction",
            actor_id=reviewer_id,
            resource_id=str(action.id),
            metadata={"status": payload.status.value, "comment": payload.comment},
        )
        self.db.commit()
        self.db.refresh(action)
        return action


class PrescriptionTemplateService:
    def __init__(self, db: Session):
        self.db = db

    def create_template(
        self, payload: PrescriptionTemplateCreate, created_by: int | None = None
    ) -> PrescriptionTemplate:
        template = PrescriptionTemplate(**payload.model_dump(), created_by=created_by)
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def list_templates(self) -> list[PrescriptionTemplate]:
        return list(self.db.scalars(select(PrescriptionTemplate).order_by(PrescriptionTemplate.id.desc())))


class TemplateMatchingService:
    def __init__(self, db: Session):
        self.db = db

    def match_template(
        self,
        risk_level: str,
        cluster_labels: list[str],
        goals: list[str],
    ) -> PrescriptionTemplate | None:
        candidates = list(
            self.db.scalars(
                select(PrescriptionTemplate).where(
                    PrescriptionTemplate.risk_level == risk_level,
                    PrescriptionTemplate.status == TemplateStatus.APPROVED,
                )
            )
        )
        if not candidates:
            return None

        cluster_set = set(cluster_labels)
        goal_set = set(goals)

        def score(template: PrescriptionTemplate) -> tuple[int, int, int]:
            cluster_score = len(cluster_set.intersection(template.cluster_tags or []))
            goal_score = len(goal_set.intersection(template.goal_tags or []))
            return cluster_score + goal_score, goal_score, template.version

        return max(candidates, key=score)
