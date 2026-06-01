from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.template import (
    ExerciseActionCreate,
    ExerciseActionRead,
    ExerciseActionReview,
    PrescriptionTemplateCreate,
    PrescriptionTemplateRead,
    TemplateMatchRequest,
)
from app.services.template_service import (
    ExerciseActionService,
    PrescriptionTemplateService,
    TemplateMatchingService,
)

router = APIRouter(prefix="/admin", tags=["admin-templates"])


@router.post("/actions", response_model=ExerciseActionRead)
def import_action(
    payload: ExerciseActionCreate,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExerciseActionService(db).create_imported_action(payload)


@router.get("/actions", response_model=list[ExerciseActionRead])
def list_actions(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExerciseActionService(db).list_actions()


@router.post("/actions/{action_id}/review", response_model=ExerciseActionRead)
def review_action(
    action_id: int,
    payload: ExerciseActionReview,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    action = ExerciseActionService(db).review_action(action_id, payload, reviewer_id=current_user.id)
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="动作不存在")
    return action


@router.post("/templates", response_model=PrescriptionTemplateRead)
def create_template(
    payload: PrescriptionTemplateCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return PrescriptionTemplateService(db).create_template(payload, created_by=current_user.id)


@router.get("/templates", response_model=list[PrescriptionTemplateRead])
def list_templates(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return PrescriptionTemplateService(db).list_templates()


@router.post("/templates/match", response_model=PrescriptionTemplateRead)
def match_template(
    payload: TemplateMatchRequest,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    template = TemplateMatchingService(db).match_template(
        risk_level=payload.risk_level,
        cluster_labels=payload.cluster_labels,
        goals=payload.goals,
    )
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未匹配到已审核模板")
    return template
