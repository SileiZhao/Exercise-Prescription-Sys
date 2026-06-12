from datetime import date
from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
    UserProfileMeasurement,
    model_to_dict,
)
from app.models.user import UserConsent
from app.schemas.health_data import (
    BiochemicalIndexCreate,
    BodyCompositionCreate,
    ExerciseFeedbackCreate,
    FitnessTestCreate,
    RiskScreeningCreate,
    UserConsentCreate,
    UserProfileCreate,
)
from app.services.audit_service import AuditService
from app.services.prescription_safety_service import require_executable_prescription

T = TypeVar("T")


def calculate_age(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    height_m = height_cm / 100
    return round(weight_kg / (height_m * height_m), 2)


def calculate_whr(waist_cm: float | None, hip_cm: float | None) -> float | None:
    if waist_cm is None or hip_cm is None or hip_cm == 0:
        return None
    return round(waist_cm / hip_cm, 2)


class HealthProfileService:
    def __init__(self, db: Session):
        self.db = db

    def accept_consent(self, user_id: int, payload: UserConsentCreate) -> UserConsent:
        active_consents = self.db.scalars(
            select(UserConsent).where(UserConsent.user_id == user_id, UserConsent.is_active.is_(True))
        ).all()
        for consent in active_consents:
            consent.is_active = False

        consent = UserConsent(user_id=user_id, **payload.model_dump())
        self.db.add(consent)
        self.db.flush()
        AuditService(self.db).record(
            action="ACCEPT_INFORMED_CONSENT",
            resource_type="USER_CONSENT",
            actor_id=user_id,
            resource_id=str(consent.id),
            metadata={"consent_version": consent.consent_version},
        )
        self.db.commit()
        self.db.refresh(consent)
        return consent

    def get_active_consent(self, user_id: int) -> UserConsent | None:
        return self.db.scalar(
            select(UserConsent)
            .where(UserConsent.user_id == user_id, UserConsent.is_active.is_(True))
            .order_by(UserConsent.accepted_at.desc(), UserConsent.id.desc())
            .limit(1)
        )

    def require_consent(self, user_id: int) -> None:
        if self.get_active_consent(user_id) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="请先完成知情同意",
            )

    def upsert_profile(self, user_id: int, payload: UserProfileCreate) -> UserProfile:
        self.require_consent(user_id)
        data = payload.model_dump()
        data["age"] = calculate_age(payload.birth_date)
        data["bmi"] = calculate_bmi(payload.height_cm, payload.weight_kg)
        data["whr"] = calculate_whr(payload.waist_cm, payload.hip_cm)

        profile = self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        if profile is None:
            profile = UserProfile(user_id=user_id, **data)
            self.db.add(profile)
        else:
            for key, value in data.items():
                setattr(profile, key, value)
        self.db.add(
            UserProfileMeasurement(
                user_id=user_id,
                height_cm=data["height_cm"],
                weight_kg=data["weight_kg"],
                bmi=data["bmi"],
                waist_cm=data["waist_cm"],
                hip_cm=data["hip_cm"],
                whr=data["whr"],
            )
        )
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def create_fitness_test(
        self, user_id: int, created_by: int, payload: FitnessTestCreate
    ) -> FitnessTest:
        self.require_consent(user_id)
        record = FitnessTest(user_id=user_id, created_by=created_by, **payload.model_dump())
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def create_body_composition(
        self, user_id: int, operator_id: int, payload: BodyCompositionCreate
    ) -> BodyComposition:
        self.require_consent(user_id)
        record = BodyComposition(user_id=user_id, operator_id=operator_id, **payload.model_dump())
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def create_biochemical_index(
        self, user_id: int, payload: BiochemicalIndexCreate
    ) -> BiochemicalIndex:
        self.require_consent(user_id)
        record = BiochemicalIndex(user_id=user_id, **payload.model_dump())
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def create_risk_screening(
        self, user_id: int, payload: RiskScreeningCreate
    ) -> RiskScreening:
        self.require_consent(user_id)
        record = RiskScreening(user_id=user_id, **payload.model_dump())
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def create_exercise_feedback(
        self, user_id: int, payload: ExerciseFeedbackCreate
    ) -> ExerciseFeedback:
        self.require_consent(user_id)
        require_executable_prescription(
            self.db,
            user_id=user_id,
            prescription_id=payload.prescription_id,
        )
        record = ExerciseFeedback(user_id=user_id, **payload.model_dump())
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def latest_snapshot(self, user_id: int) -> dict:
        profile = self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请先完成基础档案",
            )

        return {
            "profile": model_to_dict(profile),
            "fitness_test": model_to_dict(self._latest(FitnessTest, user_id, FitnessTest.measured_at)),
            "body_composition": model_to_dict(
                self._latest(BodyComposition, user_id, BodyComposition.measured_at)
            ),
            "biochemical_index": model_to_dict(
                self._latest(BiochemicalIndex, user_id, BiochemicalIndex.measured_at)
            ),
            "risk_screening": model_to_dict(
                self._latest(RiskScreening, user_id, RiskScreening.created_at)
            ),
            "exercise_feedback": model_to_dict(
                self._latest(ExerciseFeedback, user_id, ExerciseFeedback.created_at)
            ),
        }

    def _latest(self, model: type[T], user_id: int, order_column) -> T | None:
        return self.db.scalar(
            select(model).where(model.user_id == user_id).order_by(order_column.desc()).limit(1)
        )
