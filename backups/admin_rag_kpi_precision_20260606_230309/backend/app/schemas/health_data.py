from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    sex: str
    birth_date: date
    height_cm: float = Field(ge=80, le=230)
    weight_kg: float = Field(ge=20, le=250)
    waist_cm: float | None = Field(default=None, ge=40, le=180)
    hip_cm: float | None = Field(default=None, ge=50, le=200)
    occupation_type: str | None = None
    sedentary_hours: float | None = Field(default=None, ge=0, le=16)
    sleep_hours: float | None = Field(default=None, ge=0, le=14)
    exercise_goal: list[str]
    exercise_habit: str
    exercise_experience: str

    @field_validator("exercise_goal")
    @classmethod
    def validate_goal(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("至少选择一个运动目标")
        return value


class UserProfileRead(UserProfileCreate):
    id: int
    user_id: int
    age: int
    bmi: float
    whr: float | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserConsentCreate(BaseModel):
    consent_version: str = Field(min_length=1, max_length=32)
    consent_text: str = Field(min_length=20, max_length=4000)


class UserConsentRead(UserConsentCreate):
    id: int
    user_id: int
    is_active: bool
    accepted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FitnessTestCreate(BaseModel):
    resting_hr: int = Field(ge=30, le=140)
    sbp: int = Field(ge=70, le=250)
    dbp: int = Field(ge=40, le=150)
    vital_capacity: int | None = Field(default=None, ge=500, le=8000)
    grip_left: float | None = Field(default=None, ge=0, le=100)
    grip_right: float | None = Field(default=None, ge=0, le=100)
    sit_reach: float | None = Field(default=None, ge=-30, le=40)
    vertical_jump: float | None = Field(default=None, ge=0, le=100)
    push_up: int | None = Field(default=None, ge=0, le=100)
    sit_up: int | None = Field(default=None, ge=0, le=100)
    single_leg_stand: float | None = Field(default=None, ge=0, le=300)
    reaction_time: float | None = Field(default=None, ge=0.1, le=5.0)
    step_test_index: float | None = Field(default=None, ge=0, le=100)
    six_mwt: float | None = Field(default=None, ge=0, le=1000)
    pain_score: int = Field(ge=0, le=10)
    rpe_baseline: float | None = Field(default=None, ge=0, le=20)
    source: str = "manual"


class FitnessTestRead(FitnessTestCreate):
    id: int
    user_id: int
    measured_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BodyCompositionCreate(BaseModel):
    body_fat_pct: float | None = Field(default=None, ge=3, le=60)
    skeletal_muscle_kg: float | None = Field(default=None, ge=5, le=80)
    muscle_mass_kg: float | None = Field(default=None, ge=5, le=120)
    fat_free_mass: float | None = Field(default=None, ge=10, le=150)
    visceral_fat_level: float | None = Field(default=None, ge=1, le=30)
    bmr: float | None = Field(default=None, ge=600, le=3500)
    body_water_pct: float | None = Field(default=None, ge=20, le=80)
    bone_mass_kg: float | None = Field(default=None, ge=1, le=6)
    protein_pct: float | None = Field(default=None, ge=5, le=30)
    body_type: str | None = None
    device_model: str | None = None
    is_fasting: bool | None = None


class BodyCompositionRead(BodyCompositionCreate):
    id: int
    user_id: int
    measured_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BiochemicalIndexCreate(BaseModel):
    fbg: float | None = Field(default=None, ge=2.0, le=30.0)
    pbg_2h: float | None = Field(default=None, ge=2.0, le=35.0)
    hba1c: float | None = Field(default=None, ge=3.0, le=15.0)
    tc: float | None = Field(default=None, ge=1.0, le=15.0)
    tg: float | None = Field(default=None, ge=0.2, le=20.0)
    hdl_c: float | None = Field(default=None, ge=0.2, le=5.0)
    ldl_c: float | None = Field(default=None, ge=0.2, le=10.0)
    uric_acid: float | None = Field(default=None, ge=50, le=1000)
    creatinine: float | None = Field(default=None, ge=20, le=1500)
    alt: float | None = Field(default=None, ge=0, le=1000)
    ast: float | None = Field(default=None, ge=0, le=1000)
    hemoglobin: float | None = Field(default=None, ge=50, le=220)
    spo2: float | None = Field(default=None, ge=50, le=100)
    source: str = "manual"
    report_file_url: str | None = None


class BiochemicalIndexRead(BiochemicalIndexCreate):
    id: int
    user_id: int
    measured_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RiskScreeningCreate(BaseModel):
    has_hypertension: bool = False
    has_diabetes: bool = False
    has_chd: bool = False
    has_stroke: bool = False
    has_ckd: bool = False
    has_respiratory_disease: bool = False
    has_osteoporosis: bool | None = None
    has_joint_pain: bool = False
    pain_location: list[str] = Field(default_factory=list)
    recent_injury: bool = False
    surgery_history: str | None = None
    medication: list[str] = Field(default_factory=list)
    chest_pain: bool = False
    syncope: bool = False
    abnormal_dyspnea: bool = False
    palpitation: bool = False
    doctor_restriction: str | None = None
    parq_result: str | None = None


class RiskScreeningRead(RiskScreeningCreate):
    id: int
    user_id: int
    risk_level: str | None
    risk_reasons: list[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExerciseFeedbackCreate(BaseModel):
    prescription_id: int | None = None
    pre_exercise_confirmed: bool
    exercise_date: date
    exercise_type: str
    frequency_week: int = Field(ge=0, le=14)
    duration_min: int = Field(ge=0, le=240)
    intensity_level: str
    avg_hr: int | None = Field(default=None, ge=30, le=220)
    max_hr: int | None = Field(default=None, ge=30, le=240)
    pre_ex_bp_sbp: int | None = Field(default=None, ge=70, le=250)
    pre_ex_bp_dbp: int | None = Field(default=None, ge=40, le=150)
    post_ex_bp_sbp: int | None = Field(default=None, ge=70, le=250)
    post_ex_bp_dbp: int | None = Field(default=None, ge=40, le=150)
    pre_glucose: float | None = Field(default=None, ge=2.0, le=30.0)
    post_glucose: float | None = Field(default=None, ge=2.0, le=30.0)
    rpe: float = Field(ge=0, le=20)
    completion_rate: float = Field(ge=0, le=100)
    discomfort: list[str] = Field(default_factory=list)
    discomfort_detail: str | None = None
    pain_score_after: int | None = Field(default=None, ge=0, le=10)
    source: str = "manual"

    @field_validator("pre_exercise_confirmed")
    @classmethod
    def validate_pre_exercise_confirmation(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("运动前必须确认无红旗风险信号")
        return value


class ExerciseFeedbackRead(ExerciseFeedbackCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HealthSnapshot(BaseModel):
    profile: dict[str, Any] | None
    fitness_test: dict[str, Any] | None
    body_composition: dict[str, Any] | None
    biochemical_index: dict[str, Any] | None
    risk_screening: dict[str, Any] | None
    exercise_feedback: dict[str, Any] | None
