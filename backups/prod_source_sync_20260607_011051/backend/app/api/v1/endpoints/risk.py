from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.risk import RiskEvaluationResult
from app.services.risk_service import RiskEvaluationService

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/evaluate", response_model=RiskEvaluationResult)
def evaluate_risk(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return RiskEvaluationService(db).evaluate_current_user(current_user.id)
