from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.review import ExpertReviewAction, ExpertReviewActionResult, ExpertReviewDetail, ExpertReviewQueueItem
from app.services.expert_review_service import ExpertReviewService

router = APIRouter(prefix="/expert-reviews", tags=["expert-reviews"])


@router.get("", response_model=list[ExpertReviewQueueItem])
def list_review_queue(
    _: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExpertReviewService(db).list_queue()


@router.get("/{prescription_id}", response_model=ExpertReviewDetail)
def get_review_detail(
    prescription_id: int,
    _: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExpertReviewService(db).detail(prescription_id)


@router.post("/{prescription_id}/approve", response_model=ExpertReviewActionResult)
def approve_prescription(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).approve(
        prescription_id=prescription_id,
        expert_id=current_user.id,
        review_comment=payload.review_comment,
        edited_prescription=payload.edited_prescription,
    )
    return {"status": "APPROVED", "review": review, "prescription": prescription}


@router.post("/{prescription_id}/reject", response_model=ExpertReviewActionResult)
def reject_prescription(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).reject(
        prescription_id=prescription_id,
        expert_id=current_user.id,
        review_comment=payload.review_comment,
    )
    return {"status": "REJECTED", "review": review, "prescription": prescription}


@router.post("/{prescription_id}/refer", response_model=ExpertReviewActionResult)
def refer_prescription(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).refer(
        prescription_id=prescription_id,
        expert_id=current_user.id,
        review_comment=payload.review_comment,
    )
    return {"status": "REFERRED", "review": review, "prescription": prescription}
