from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.template import (
    ActionReviewStatus,
    ExerciseAction,
    PrescriptionTemplate,
    TemplateStatus,
)
from app.models.user import utcnow
from app.schemas.template import (
    ExerciseActionCreate,
    ExerciseActionReview,
    ExerciseActionUpdate,
    PrescriptionTemplateCreate,
    PrescriptionTemplateUpdate,
)
from app.services.audit_service import AuditService


def _json_value(value):
    return value.value if hasattr(value, "value") else value


def _collect_changes(instance, updates: dict) -> dict:
    changes = {}
    for field, value in updates.items():
        before = getattr(instance, field)
        after = value
        if before != after:
            changes[field] = {"before": _json_value(before), "after": _json_value(after)}
    return changes


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

    def update_action(
        self,
        action_id: int,
        payload: ExerciseActionUpdate,
        actor_id: int,
    ) -> ExerciseAction | None:
        action = self.db.get(ExerciseAction, action_id)
        if action is None:
            return None
        updates = payload.model_dump(exclude_unset=True)
        changes = _collect_changes(action, updates)
        for field, value in updates.items():
            setattr(action, field, value)
        if changes:
            AuditService(self.db).record(
                action="UPDATE_EXERCISE_ACTION",
                resource_type="ExerciseAction",
                actor_id=actor_id,
                resource_id=str(action.id),
                metadata={"changes": changes},
            )
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
        data = payload.model_dump()
        data["status"] = TemplateStatus.DRAFT
        data["review_status"] = "EXPERT_REVIEW_DRAFT"
        template = PrescriptionTemplate(**data, created_by=created_by)
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def update_template(
        self,
        template_id: int,
        payload: PrescriptionTemplateUpdate,
        actor_id: int,
    ) -> PrescriptionTemplate | None:
        template = self.db.get(PrescriptionTemplate, template_id)
        if template is None:
            return None
        updates = payload.model_dump(exclude_unset=True)
        merged_risk_level = updates.get("risk_level", template.risk_level)
        merged_fitt_vp = updates.get("fitt_vp", template.fitt_vp)
        if merged_risk_level == "R3" and merged_fitt_vp is not None:
            raise ValueError("R3 安全提醒模板不能包含 FITT-VP 对象。")

        changes = _collect_changes(template, updates)
        version_before = template.version
        for field, value in updates.items():
            setattr(template, field, value)
        if changes:
            template.version = version_before + 1
            AuditService(self.db).record(
                action="UPDATE_PRESCRIPTION_TEMPLATE",
                resource_type="PrescriptionTemplate",
                actor_id=actor_id,
                resource_id=str(template.id),
                metadata={
                    "version_before": version_before,
                    "version_after": template.version,
                    "changes": changes,
                },
            )
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
        if risk_level == "R3":
            return None
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

    def candidate_actions(self, risk_level: str, cluster_labels: list[str], goals: list[str]) -> list[dict]:
        rows = list(
            self.db.scalars(
                select(ExerciseAction)
                .where(ExerciseAction.status == ActionReviewStatus.APPROVED)
                .order_by(ExerciseAction.id.asc())
            )
        )
        tags = {risk_level, *cluster_labels, *goals}
        candidates: list[tuple[int, ExerciseAction]] = []
        for action in rows:
            risk_match = action.risk_level == risk_level or risk_level in (action.risk_level or "").split("/")
            tag_score = len(tags.intersection(set(action.suitable_tags or [])))
            if not risk_match and tag_score <= 0:
                continue
            candidates.append((tag_score + int(risk_match), action))
        candidates.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "id": action.id,
                "source": action.source,
                "source_exercise_id": action.source_exercise_id,
                "name": action.name,
                "name_en": action.name_en,
                "category": action.category,
                "exercise_type": action.exercise_type,
                "image_url": action.image_url,
                "joint_stress_level": action.joint_stress_level,
                "impact_level": action.impact_level,
                "requires_equipment": action.requires_equipment,
                "is_traditional_exercise": action.is_traditional_exercise,
                "risk_level": action.risk_level,
                "suitable_tags": action.suitable_tags or [],
                "contraindication_tags": action.contraindication_tags or [],
                "body_parts": action.body_parts or [],
                "primary_muscles": action.primary_muscles or [],
                "equipment": action.equipment,
                "intensity": action.intensity,
                "difficulty": action.difficulty,
                "instructions": action.instructions,
                "alternatives": action.alternatives or [],
                "monitoring_tips": action.monitoring_tips or [],
                "stop_signals": action.stop_signals or [],
            }
            for _, action in candidates[:8]
        ]
