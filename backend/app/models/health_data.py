from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import utcnow


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    sex: Mapped[str] = mapped_column(String(16))
    birth_date: Mapped[date] = mapped_column(Date)
    age: Mapped[int] = mapped_column(Integer)
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    bmi: Mapped[float] = mapped_column(Float)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    whr: Mapped[float | None] = mapped_column(Float, nullable=True)
    occupation_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sedentary_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    exercise_goal: Mapped[list[str]] = mapped_column(JSON, default=list)
    exercise_habit: Mapped[str] = mapped_column(String(64))
    exercise_experience: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class FitnessTest(Base):
    __tablename__ = "fitness_test"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    resting_hr: Mapped[int] = mapped_column(Integer)
    sbp: Mapped[int] = mapped_column(Integer)
    dbp: Mapped[int] = mapped_column(Integer)
    vital_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grip_left: Mapped[float | None] = mapped_column(Float, nullable=True)
    grip_right: Mapped[float | None] = mapped_column(Float, nullable=True)
    sit_reach: Mapped[float | None] = mapped_column(Float, nullable=True)
    vertical_jump: Mapped[float | None] = mapped_column(Float, nullable=True)
    push_up: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sit_up: Mapped[int | None] = mapped_column(Integer, nullable=True)
    single_leg_stand: Mapped[float | None] = mapped_column(Float, nullable=True)
    reaction_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    step_test_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    six_mwt: Mapped[float | None] = mapped_column(Float, nullable=True)
    pain_score: Mapped[int] = mapped_column(Integer)
    rpe_baseline: Mapped[float | None] = mapped_column(Float, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class BodyComposition(Base):
    __tablename__ = "body_composition"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    skeletal_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    muscle_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_free_mass: Mapped[float | None] = mapped_column(Float, nullable=True)
    visceral_fat_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    bmr: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_water_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    bone_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    is_fasting: Mapped[bool | None] = mapped_column(nullable=True)
    operator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class BiochemicalIndex(Base):
    __tablename__ = "biochemical_index"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    fbg: Mapped[float | None] = mapped_column(Float, nullable=True)
    pbg_2h: Mapped[float | None] = mapped_column(Float, nullable=True)
    hba1c: Mapped[float | None] = mapped_column(Float, nullable=True)
    tc: Mapped[float | None] = mapped_column(Float, nullable=True)
    tg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hdl_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    ldl_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    uric_acid: Mapped[float | None] = mapped_column(Float, nullable=True)
    creatinine: Mapped[float | None] = mapped_column(Float, nullable=True)
    alt: Mapped[float | None] = mapped_column(Float, nullable=True)
    ast: Mapped[float | None] = mapped_column(Float, nullable=True)
    hemoglobin: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2: Mapped[float | None] = mapped_column(Float, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    report_file_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class RiskScreening(Base):
    __tablename__ = "risk_screening"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    has_hypertension: Mapped[bool] = mapped_column(default=False)
    has_diabetes: Mapped[bool] = mapped_column(default=False)
    has_chd: Mapped[bool] = mapped_column(default=False)
    has_stroke: Mapped[bool] = mapped_column(default=False)
    has_ckd: Mapped[bool] = mapped_column(default=False)
    has_respiratory_disease: Mapped[bool] = mapped_column(default=False)
    has_osteoporosis: Mapped[bool | None] = mapped_column(nullable=True)
    has_joint_pain: Mapped[bool] = mapped_column(default=False)
    pain_location: Mapped[list[str]] = mapped_column(JSON, default=list)
    recent_injury: Mapped[bool] = mapped_column(default=False)
    surgery_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    medication: Mapped[list[str]] = mapped_column(JSON, default=list)
    chest_pain: Mapped[bool] = mapped_column(default=False)
    syncope: Mapped[bool] = mapped_column(default=False)
    abnormal_dyspnea: Mapped[bool] = mapped_column(default=False)
    palpitation: Mapped[bool] = mapped_column(default=False)
    doctor_restriction: Mapped[str | None] = mapped_column(Text, nullable=True)
    parq_result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    risk_reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ExerciseFeedback(Base):
    __tablename__ = "exercise_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    prescription_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    pre_exercise_confirmed: Mapped[bool] = mapped_column(default=True)
    exercise_date: Mapped[date] = mapped_column(Date, index=True)
    exercise_type: Mapped[str] = mapped_column(String(64))
    frequency_week: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer)
    intensity_level: Mapped[str] = mapped_column(String(16))
    avg_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pre_ex_bp_sbp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pre_ex_bp_dbp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    post_ex_bp_sbp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    post_ex_bp_dbp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pre_glucose: Mapped[float | None] = mapped_column(Float, nullable=True)
    post_glucose: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float] = mapped_column(Float)
    completion_rate: Mapped[float] = mapped_column(Float)
    discomfort: Mapped[list[str]] = mapped_column(JSON, default=list)
    discomfort_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    pain_score_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def model_to_dict(obj: Any | None) -> dict[str, Any] | None:
    if obj is None:
        return None
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}
