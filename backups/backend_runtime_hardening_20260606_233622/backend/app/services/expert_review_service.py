from datetime import date, datetime, time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit import utcnow
from app.models.enums import UserRole
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    model_to_dict,
)
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.health_profile_service import HealthProfileService
from app.services.prescription_safety_service import enforce_prescription_safety


class ExpertReviewService:
    def __init__(self, db: Session):
        self.db = db
        self.audit = AuditService(db)

    def list_queue(
        self,
        risk_level: str | None = None,
        status_filter: str | None = None,
        organization_id: int | None = None,
        prescription_type: str | None = None,
        abnormal_feedback: bool | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        current_user: User | None = None,
    ) -> list[dict[str, Any]]:
        filters = [PrescriptionRecord.status.in_(["PENDING_REVIEW", "IN_REVIEW", "REFERRED", "NEEDS_INFO", "PAUSED"])]
        if risk_level:
            filters.append(PrescriptionRecord.risk_level == risk_level)
        if status_filter:
            filters.append(PrescriptionRecord.status == status_filter)
        if start_date:
            filters.append(PrescriptionRecord.created_at >= datetime.combine(start_date, time.min))
        if end_date:
            filters.append(PrescriptionRecord.created_at <= datetime.combine(end_date, time.max))
        if prescription_type == "training":
            filters.append(PrescriptionRecord.fitt_vp.is_not(None))
        elif prescription_type == "referral":
            filters.append(PrescriptionRecord.fitt_vp.is_(None))

        statement = select(PrescriptionRecord).where(*filters).order_by(PrescriptionRecord.created_at.asc())
        statement = self._apply_queue_scope(statement, current_user, organization_id)
        records = list(
            self.db.scalars(statement)
        )
        queue: list[dict[str, Any]] = []
        for record in records:
            abnormal_count = self._abnormal_feedback_count(record)
            if abnormal_feedback is True and abnormal_count <= 0:
                continue
            if abnormal_feedback is False and abnormal_count > 0:
                continue
            review = self._get_or_create_review(record)
            if current_user is not None and self._role(current_user) == UserRole.EXPERT:
                if review.expert_id is not None and review.expert_id != current_user.id:
                    continue
            user = self.db.get(User, record.user_id)
            queue.append(
                {
                    "prescription_id": record.id,
                    "user_id": record.user_id,
                    "organization_id": user.organization_id if user else None,
                    "risk_level": record.risk_level,
                    "status": record.status,
                    "prescription_type": "training" if record.fitt_vp else "referral",
                    "abnormal_feedback_count": abnormal_count,
                    "version": record.version,
                    "created_at": record.created_at,
                    "review_id": review.id,
                }
            )
        self.db.commit()
        return queue

    def stats(self, current_user: User | None = None) -> dict[str, Any]:
        reviewed_statement = (
            select(ExpertReview)
            .join(PrescriptionRecord, PrescriptionRecord.id == ExpertReview.prescription_id)
            .where(ExpertReview.reviewed_at.is_not(None))
            .order_by(ExpertReview.reviewed_at.desc())
        )
        reviewed_statement = self._apply_queue_scope(reviewed_statement, current_user, None)
        reviewed = list(self.db.scalars(reviewed_statement))
        durations = [
            max((review.reviewed_at - review.created_at).total_seconds() / 3600, 0.0)
            for review in reviewed
            if review.reviewed_at is not None
        ]
        r2_statement = select(func.count(PrescriptionRecord.id)).where(
            PrescriptionRecord.risk_level == "R2",
            PrescriptionRecord.status == "PENDING_REVIEW",
        )
        r2_statement = self._apply_queue_scope(r2_statement, current_user, None)
        r2_pending_count = self.db.scalar(r2_statement) or 0
        now = utcnow()
        pending_statement = select(PrescriptionRecord).where(PrescriptionRecord.status.in_(["PENDING_REVIEW", "REFERRED"]))
        pending_statement = self._apply_queue_scope(pending_statement, current_user, None)
        pending = list(self.db.scalars(pending_statement)
        )
        timeout_count = sum(1 for record in pending if (now - record.created_at).total_seconds() / 3600 >= 24)
        return {
            "average_review_hours": round(sum(durations) / len(durations), 2) if durations else 0.0,
            "r2_pending_count": int(r2_pending_count),
            "timeout_count": timeout_count,
        }

    def detail(self, prescription_id: int, current_user: User) -> dict[str, Any]:
        record = self.db.get(PrescriptionRecord, prescription_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="处方不存在")
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
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
            "health_snapshot": self._health_snapshot_for_review(record.user_id),
            "risk_rules": (record.llm_payload or {}).get("risk_rules") or [],
            "evidence_refs": record.evidence_refs or [],
            "template": template_payload,
            "candidate_actions": (record.llm_payload or {}).get("candidate_actions") or [],
            "versions": self._version_history(record),
            "trends": self._trend_summary(record),
        }

    def start_review(
        self,
        prescription_id: int,
        current_user: User,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, allow_claim=True, require_assignment=False)
        if self._role(current_user) == UserRole.EXPERT:
            review.expert_id = current_user.id
        review.status = "IN_REVIEW"
        review.action = "START"
        review.review_comment = review.review_comment or "专家已开始审核。"
        record.status = "IN_REVIEW"
        record.expert_review_required = True
        record.updated_at = utcnow()
        self.audit.record(
            action="EXPERT_START_REVIEW",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=current_user.id,
            metadata={"review_id": review.id},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def approve(
        self,
        prescription_id: int,
        current_user: User,
        review_comment: str,
        edited_prescription: dict[str, Any],
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
        if record.status == "REFERRED" or record.risk_level == "R3" or record.fitt_vp is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="转介处方不能批准为训练处方",
            )

        self._assign_expert_if_needed(review, current_user)
        review.status = "APPROVED"
        review.action = "APPROVE"
        review.review_comment = review_comment
        review.edited_prescription = edited_prescription
        review.reviewed_at = utcnow()

        safe_edit = self._safe_edited_prescription(record, edited_prescription)
        self._apply_edit(record, safe_edit)
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
                actor_id=current_user.id,
            )
        )
        self.audit.record(
            action="EXPERT_APPROVE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=current_user.id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def reject(
        self,
        prescription_id: int,
        current_user: User,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
        self._assign_expert_if_needed(review, current_user)
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
            actor_id=current_user.id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def refer(
        self,
        prescription_id: int,
        current_user: User,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
        self._assign_expert_if_needed(review, current_user)
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
            actor_id=current_user.id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def request_info(
        self,
        prescription_id: int,
        current_user: User,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
        self._assign_expert_if_needed(review, current_user)
        review.status = "NEEDS_INFO"
        review.action = "REQUEST_INFO"
        review.review_comment = review_comment
        review.reviewed_at = utcnow()
        record.status = "NEEDS_INFO"
        record.expert_review_required = True
        record.safety_notice = review_comment
        record.updated_at = utcnow()
        self.audit.record(
            action="EXPERT_REQUEST_INFO",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=current_user.id,
            metadata={"review_id": review.id, "comment": review_comment},
        )
        self.db.commit()
        self.db.refresh(review)
        self.db.refresh(record)
        return review, record

    def pause(
        self,
        prescription_id: int,
        current_user: User,
        review_comment: str,
    ) -> tuple[ExpertReview, PrescriptionRecord]:
        record = self._get_reviewable_record(prescription_id)
        review = self._get_or_create_review(record)
        self._assert_record_access(record, current_user, review=review, require_assignment=True)
        self._assign_expert_if_needed(review, current_user)
        review.status = "PAUSED"
        review.action = "PAUSE"
        review.review_comment = review_comment
        review.reviewed_at = utcnow()
        record.status = "PAUSED"
        record.expert_review_required = True
        record.safety_notice = review_comment
        record.updated_at = utcnow()
        self.audit.record(
            action="EXPERT_PAUSE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(record.id),
            actor_id=current_user.id,
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
        if record.status not in {"PENDING_REVIEW", "IN_REVIEW", "REFERRED", "NEEDS_INFO", "PAUSED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="处方不在审核队列")
        return record

    def _apply_queue_scope(self, statement, current_user: User | None, organization_id: int | None):
        if current_user is None:
            if organization_id is not None:
                return statement.join(User, User.id == PrescriptionRecord.user_id).where(
                    User.organization_id == organization_id
                )
            return statement

        role = self._role(current_user)
        if role == UserRole.ADMIN:
            if organization_id is not None:
                return statement.join(User, User.id == PrescriptionRecord.user_id).where(
                    User.organization_id == organization_id
                )
            return statement

        if organization_id is not None and organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问其他机构审核队列")

        statement = statement.join(User, User.id == PrescriptionRecord.user_id)
        if current_user.organization_id is None:
            return statement.where(User.organization_id.is_(None))
        return statement.where(User.organization_id == current_user.organization_id)

    def _assert_record_access(
        self,
        record: PrescriptionRecord,
        current_user: User,
        *,
        review: ExpertReview | None,
        allow_claim: bool = False,
        require_assignment: bool = False,
    ) -> None:
        role = self._role(current_user)
        if role == UserRole.ADMIN:
            return

        record_user = self.db.get(User, record.user_id)
        record_org_id = record_user.organization_id if record_user else None
        if current_user.organization_id != record_org_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问其他机构审核任务")

        if role != UserRole.EXPERT:
            return

        assigned_expert_id = review.expert_id if review is not None else None
        if assigned_expert_id is not None and assigned_expert_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="审核任务已分配给其他专家")
        if require_assignment and assigned_expert_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="请先开始审核该任务")
        if not allow_claim and assigned_expert_id is None and require_assignment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="请先开始审核该任务")

    def _role(self, user: User) -> UserRole:
        if isinstance(user.role, UserRole):
            return user.role
        return UserRole(str(user.role))

    def _assign_expert_if_needed(self, review: ExpertReview, current_user: User) -> None:
        if self._role(current_user) == UserRole.EXPERT and review.expert_id is None:
            review.expert_id = current_user.id

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

    def _safe_edited_prescription(self, record: PrescriptionRecord, edit: dict[str, Any]) -> dict[str, Any]:
        allowed = {"fitt_vp", "precautions", "contraindications", "reassessment", "safety_notice"}
        merged = {
            "risk_level": record.risk_level,
            "cluster_label": record.cluster_label or "",
            "goals": record.goals or [],
            "fitt_vp": record.fitt_vp,
            "precautions": record.precautions or [],
            "contraindications": record.contraindications or [],
            "reassessment": record.reassessment,
            "evidence_refs": record.evidence_refs or [],
            "expert_review_required": record.expert_review_required,
            "safety_notice": record.safety_notice,
        }
        merged.update({key: value for key, value in (edit or {}).items() if key in allowed})
        snapshot = HealthProfileService(self.db).latest_snapshot(record.user_id)
        return enforce_prescription_safety(
            record.risk_level,
            merged,
            risk_contraindications=merged.get("contraindications") or record.contraindications or [],
            risk_snapshot=snapshot,
            template_fitt_vp=self._template_fitt_vp(record),
            candidate_action_names=[],
        )

    def _template_fitt_vp(self, record: PrescriptionRecord) -> dict[str, Any] | None:
        if record.template_id is None:
            return record.fitt_vp
        template = self.db.get(PrescriptionTemplate, record.template_id)
        return template.fitt_vp if template is not None else record.fitt_vp

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

    def _abnormal_feedback_count(self, record: PrescriptionRecord) -> int:
        red_terms = {"胸痛", "胸闷", "晕厥", "头晕", "黑蒙", "严重气短", "气短", "喘憋", "心悸", "疼痛"}
        feedback_items = self.db.scalars(
            select(ExerciseFeedback).where(ExerciseFeedback.prescription_id == record.id)
        ).all()
        return sum(
            1
            for item in feedback_items
            if item.rpe >= 17
            or item.completion_rate < 60
            or (item.pain_score_after is not None and item.pain_score_after >= 4)
            or bool(set(item.discomfort or []) & red_terms)
        )

    def _health_snapshot_for_review(self, user_id: int) -> dict[str, Any]:
        try:
            return HealthProfileService(self.db).latest_snapshot(user_id)
        except HTTPException as exc:
            if exc.status_code != status.HTTP_400_BAD_REQUEST:
                raise
            return {
                "profile": {"value": None, "null_reason": str(exc.detail)},
                "fitness_test": model_to_dict(self._latest(FitnessTest, user_id, FitnessTest.measured_at)),
                "body_composition": model_to_dict(self._latest(BodyComposition, user_id, BodyComposition.measured_at)),
                "biochemical_index": model_to_dict(self._latest(BiochemicalIndex, user_id, BiochemicalIndex.measured_at)),
                "risk_screening": model_to_dict(self._latest(RiskScreening, user_id, RiskScreening.created_at)),
                "exercise_feedback": model_to_dict(self._latest(ExerciseFeedback, user_id, ExerciseFeedback.created_at)),
            }

    def _version_history(self, record: PrescriptionRecord) -> list[dict[str, Any]]:
        versions = self.db.scalars(
            select(PrescriptionVersion)
            .where(PrescriptionVersion.prescription_id == record.id)
            .order_by(PrescriptionVersion.version.asc(), PrescriptionVersion.created_at.asc())
        ).all()
        if not versions:
            return [
                {
                    "version": record.version,
                    "status": record.status,
                    "change_reason": "CURRENT",
                    "actor_id": None,
                    "updated_at": record.updated_at.isoformat() if record.updated_at else None,
                    "snapshot": self._version_snapshot(record),
                }
            ]
        return [
            {
                "version": version.version,
                "status": (version.snapshot or {}).get("status") or record.status,
                "change_reason": version.change_reason,
                "actor_id": version.actor_id,
                "updated_at": version.created_at.isoformat() if version.created_at else None,
                "snapshot": version.snapshot or {},
            }
            for version in versions
        ]

    def _trend_summary(self, record: PrescriptionRecord) -> dict[str, Any]:
        fitness_tests = self.db.scalars(
            select(FitnessTest)
            .where(FitnessTest.user_id == record.user_id)
            .order_by(FitnessTest.measured_at.asc(), FitnessTest.id.asc())
        ).all()
        feedback_items = self.db.scalars(
            select(ExerciseFeedback)
            .where(ExerciseFeedback.user_id == record.user_id, ExerciseFeedback.prescription_id == record.id)
            .order_by(ExerciseFeedback.exercise_date.asc(), ExerciseFeedback.id.asc())
        ).all()
        return {
            "blood_pressure": [f"{item.sbp}/{item.dbp}" for item in fitness_tests if item.sbp is not None and item.dbp is not None],
            "feedback_completion": [item.completion_rate for item in feedback_items if item.completion_rate is not None],
            "feedback_rpe": [item.rpe for item in feedback_items if item.rpe is not None],
        }

    def _latest(self, model: type[Any], user_id: int, order_column: Any) -> Any | None:
        return self.db.scalar(
            select(model).where(model.user_id == user_id).order_by(order_column.desc()).limit(1)
        )
