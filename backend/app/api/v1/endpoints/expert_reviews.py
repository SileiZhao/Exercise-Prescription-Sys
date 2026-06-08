from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.review import (
    ExpertReviewAction,
    ExpertReviewActionResult,
    ExpertReviewDetail,
    ExpertReviewQueueItem,
    ExpertReviewStats,
)
from app.services.expert_review_service import ExpertReviewService

router = APIRouter(prefix="/expert-reviews", tags=["expert-reviews"])


@router.get("", response_model=list[ExpertReviewQueueItem])
def list_review_queue(
    risk_level: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    organization_id: int | None = None,
    prescription_type: str | None = None,
    abnormal_feedback: bool | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExpertReviewService(db).list_queue(
        risk_level=risk_level,
        status_filter=status_filter,
        organization_id=organization_id,
        prescription_type=prescription_type,
        abnormal_feedback=abnormal_feedback,
        start_date=start_date,
        end_date=end_date,
        current_user=current_user,
    )


@router.get("/stats", response_model=ExpertReviewStats)
def get_review_stats(
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExpertReviewService(db).stats(current_user=current_user)


@router.get("/{prescription_id}", response_model=ExpertReviewDetail)
def get_review_detail(
    prescription_id: int,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ExpertReviewService(db).detail(prescription_id, current_user=current_user)


@router.post("/{prescription_id}/start", response_model=ExpertReviewActionResult)
def start_review(
    prescription_id: int,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).start_review(
        prescription_id=prescription_id,
        current_user=current_user,
    )
    return {"status": "IN_REVIEW", "review": review, "prescription": prescription}


@router.post("/{prescription_id}/approve", response_model=ExpertReviewActionResult)
def approve_prescription(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).approve(
        prescription_id=prescription_id,
        current_user=current_user,
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
        current_user=current_user,
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
        current_user=current_user,
        review_comment=payload.review_comment,
    )
    return {"status": "REFERRED", "review": review, "prescription": prescription}


@router.post("/{prescription_id}/request-info", response_model=ExpertReviewActionResult)
def request_more_information(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).request_info(
        prescription_id=prescription_id,
        current_user=current_user,
        review_comment=payload.review_comment,
    )
    return {"status": "NEEDS_INFO", "review": review, "prescription": prescription}


@router.post("/{prescription_id}/pause", response_model=ExpertReviewActionResult)
def pause_prescription(
    prescription_id: int,
    payload: ExpertReviewAction,
    current_user: User = Depends(require_roles(UserRole.EXPERT, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    review, prescription = ExpertReviewService(db).pause(
        prescription_id=prescription_id,
        current_user=current_user,
        review_comment=payload.review_comment,
    )
    return {"status": "PAUSED", "review": review, "prescription": prescription}
