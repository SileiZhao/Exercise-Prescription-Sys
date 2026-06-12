from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.health_data import ExerciseFeedback
from app.models.user import User
from app.schemas.feedback import FeedbackAdjustmentRead, PhaseAssessmentRead
from app.services.feedback_adjustment_service import FeedbackAdjustmentService

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/{feedback_id}/adjust", response_model=FeedbackAdjustmentRead)
def adjust_after_feedback(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    feedback = db.get(ExerciseFeedback, feedback_id)
    if feedback is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运动反馈不存在")
    if feedback.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    return FeedbackAdjustmentService(db).adjust_after_feedback(feedback_id, actor_id=current_user.id)


@router.get("/phase-assessment", response_model=PhaseAssessmentRead)
def get_phase_assessment(
    prescription_id: int | None = None,
    weeks: int = 4,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return FeedbackAdjustmentService(db).phase_assessment(
        user_id=current_user.id,
        prescription_id=prescription_id,
        weeks=weeks,
    )
