from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.health_data import (
    BiochemicalIndexCreate,
    BiochemicalIndexRead,
    BodyCompositionCreate,
    BodyCompositionRead,
    ExerciseFeedbackCreate,
    ExerciseFeedbackRead,
    FitnessTestCreate,
    FitnessTestRead,
    HealthSnapshot,
    RiskScreeningCreate,
    RiskScreeningRead,
    UserConsentCreate,
    UserConsentRead,
    UserProfileCreate,
    UserProfileRead,
)
from app.services.health_profile_service import HealthProfileService

router = APIRouter(prefix="/health-data", tags=["health-data"])


@router.post("/consent", response_model=UserConsentRead)
def accept_consent(
    payload: UserConsentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).accept_consent(current_user.id, payload)


@router.get("/consent", response_model=UserConsentRead | None)
def get_active_consent(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).get_active_consent(current_user.id)


@router.put("/profile", response_model=UserProfileRead)
def upsert_profile(
    payload: UserProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).upsert_profile(current_user.id, payload)


@router.post("/fitness-tests", response_model=FitnessTestRead)
def create_fitness_test(
    payload: FitnessTestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).create_fitness_test(current_user.id, current_user.id, payload)


@router.post("/body-compositions", response_model=BodyCompositionRead)
def create_body_composition(
    payload: BodyCompositionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).create_body_composition(current_user.id, current_user.id, payload)


@router.post("/biochemical-indexes", response_model=BiochemicalIndexRead)
def create_biochemical_index(
    payload: BiochemicalIndexCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).create_biochemical_index(current_user.id, payload)


@router.post("/risk-screenings", response_model=RiskScreeningRead)
def create_risk_screening(
    payload: RiskScreeningCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).create_risk_screening(current_user.id, payload)


@router.post("/exercise-feedback", response_model=ExerciseFeedbackRead)
def create_exercise_feedback(
    payload: ExerciseFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).create_exercise_feedback(current_user.id, payload)


@router.get("/snapshot", response_model=HealthSnapshot)
def get_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthProfileService(db).latest_snapshot(current_user.id)
