from argparse import ArgumentParser
import os
from datetime import UTC, date, datetime, timedelta

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.audit import AuditLog
from app.models.cluster import UserClusterAssignment
from app.models.enums import OrganizationType, UserRole
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
    UserProfileMeasurement,
)
from app.models.prescription import PrescriptionRecord, PrescriptionVersion, ReportExportRecord
from app.models.research import ResearchExportRequest
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus
from app.models.user import ExpertProfile, Organization, RefreshToken, User, UserConsent

DEMO_ORGANIZATION_NAME = "河南体育学院运动促进健康示范中心"
DEMO_PASSWORD_ENV = "EPS_DEMO_PASSWORD"


def _demo_password() -> str:
    password = os.getenv(DEMO_PASSWORD_ENV)
    if not password:
        raise RuntimeError(f"{DEMO_PASSWORD_ENV} must be set before seeding demo users.")
    return password
DEMO_MARKER = "[DEMO]"
DEMO_SAMPLE_COUNT = 40

DEMO_ACCOUNTS: tuple[tuple[str, str, UserRole], ...] = (
    ("demo-user-r0@example.com", f"{DEMO_MARKER} R0 演示用户", UserRole.USER),
    ("demo-user-r1@example.com", f"{DEMO_MARKER} R1 演示用户", UserRole.USER),
    ("demo-user-r2@example.com", f"{DEMO_MARKER} R2 演示用户", UserRole.USER),
    ("demo-user-r3@example.com", f"{DEMO_MARKER} R3 演示用户", UserRole.USER),
    ("demo-expert@example.com", f"{DEMO_MARKER} 审核专家", UserRole.EXPERT),
    ("demo-admin@example.com", f"{DEMO_MARKER} 平台管理员", UserRole.ADMIN),
    ("demo-researcher@example.com", f"{DEMO_MARKER} 科研人员", UserRole.RESEARCHER),
)

RISK_LEVELS = ("R0", "R1", "R2", "R3")

LOGIN_ACCOUNT_RISKS: dict[str, tuple[str, int]] = {
    "demo-user-r0@example.com": ("R0", 1),
    "demo-user-r1@example.com": ("R1", 11),
    "demo-user-r2@example.com": ("R2", 24),
    "demo-user-r3@example.com": ("R3", 31),
}

DEMO_TEMPLATE_CODES = {risk_level: f"DEMO_{risk_level}_PRESCRIPTION_TEMPLATE" for risk_level in RISK_LEVELS}

DEMO_CLUSTER_LABELS = {
    "R0": "一般健康维持型",
    "R1": "久坐低体能关注型",
    "R2": "慢病风险管理型",
    "R3": "高风险医学转介型",
}

DEMO_CLUSTER_SUMMARIES = {
    "R0": "demo_seed: 一般健康成人，当前以维持心肺耐力、肌力和柔韧性为主。",
    "R1": "demo_seed: 久坐或低体能关注人群，适合低到中等强度循序进阶。",
    "R2": "demo_seed: 慢病风险管理人群，处方发布前需要专家审核强度和禁忌。",
    "R3": "demo_seed: 高风险或红旗信号人群，默认医学转介，不直接生成训练处方。",
}


def _empty_result() -> dict[str, dict[str, int]]:
    return {
        "organizations": {"created": 0, "deleted": 0},
        "users": {"created": 0, "updated": 0, "deleted": 0},
        "profiles": {"created": 0, "updated": 0, "deleted": 0},
        "health_records": {"created": 0, "deleted": 0},
        "prescriptions": {"created": 0, "deleted": 0},
        "reviews": {"created": 0, "deleted": 0},
        "export_requests": {"created": 0, "deleted": 0},
        "report_exports": {"created": 0, "deleted": 0},
        "templates": {"created": 0, "updated": 0, "deleted": 0},
        "clusters": {"created": 0, "updated": 0, "deleted": 0},
        "audit_logs": {"created": 0, "deleted": 0},
        "auth_tokens": {"created": 0, "deleted": 0},
        "consents": {"created": 0, "deleted": 0},
    }


def ensure_demo_organization(db: Session) -> tuple[Organization, bool]:
    organization = db.scalar(select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME))
    if organization is not None:
        organization.type = OrganizationType.SCHOOL
        organization.contact_person = "演示数据管理员"
        organization.contact_phone = "0371-00000000"
        organization.address = "河南省郑州市"
        organization.status = "ACTIVE"
        return organization, False

    organization = Organization(
        name=DEMO_ORGANIZATION_NAME,
        type=OrganizationType.SCHOOL,
        contact_person="演示数据管理员",
        contact_phone="0371-00000000",
        address="河南省郑州市",
        status="ACTIVE",
    )
    db.add(organization)
    db.flush()
    return organization, True


def _ensure_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    role: UserRole,
    organization_id: int,
) -> tuple[User, bool]:
    user = db.scalar(select(User).where(User.email == email))
    created = user is None
    if user is None:
        user = User(email=email, hashed_password=get_password_hash(_demo_password()), full_name=full_name)
        db.add(user)

    user.full_name = full_name
    user.hashed_password = get_password_hash(_demo_password())
    user.role = role
    user.organization_id = organization_id
    user.is_active = True
    user.is_verified = True
    user.must_change_password = False
    db.flush()

    if role == UserRole.EXPERT:
        profile = db.scalar(select(ExpertProfile).where(ExpertProfile.user_id == user.id))
        if profile is None:
            db.add(
                ExpertProfile(
                    user_id=user.id,
                    title="运动促进健康演示专家",
                    specialty="运动处方审核与慢病风险干预",
                    certificate_no="DEMO-EXPERT-001",
                    bio="demo_seed expert profile",
                    review_capacity_per_day=30,
                )
            )
    return user, created


def _demo_spec(
    *,
    email: str,
    full_name: str,
    risk_level: str,
    ordinal: int,
    occupation_type: str,
) -> dict[str, object]:
    index = max(ordinal - 1, 0)
    risk_index = RISK_LEVELS.index(risk_level)
    sex = "男" if index % 2 == 0 else "女"
    age = 24 + index % 34
    height = 160 + (index % 16) + (3 if sex == "男" else 0)
    weight = 56 + (index % 10) * 1.8 + risk_index * 4.5
    bmi = round(weight / ((height / 100) ** 2), 1)
    waist = round(72 + (index % 8) * 1.8 + risk_index * 5, 1)
    hip = round(90 + (index % 6) * 1.7 + risk_index * 2, 1)
    return {
        "email": email,
        "ordinal": ordinal,
        "full_name": full_name,
        "risk_level": risk_level,
        "sex": sex,
        "age": age,
        "birth_date": date(2026 - age, (index % 12) + 1, (index % 26) + 1),
        "height": float(height),
        "weight": round(float(weight), 1),
        "bmi": float(bmi),
        "waist": waist,
        "hip": hip,
        "occupation_type": occupation_type,
    }


def _sample_specs() -> list[dict[str, object]]:
    return [
        _demo_spec(
            email=f"demo-sample-{ordinal:02d}-{risk_level.lower()}@example.com",
            full_name=f"{DEMO_MARKER} {risk_level} 样本{ordinal:02d}",
            risk_level=risk_level,
            ordinal=ordinal,
            occupation_type="demo_sample",
        )
        for ordinal in range(1, DEMO_SAMPLE_COUNT + 1)
        for risk_level in [RISK_LEVELS[(ordinal - 1) // 10]]
    ]


def _login_account_specs() -> list[dict[str, object]]:
    account_names = {email: full_name for email, full_name, role in DEMO_ACCOUNTS if role == UserRole.USER}
    return [
        _demo_spec(
            email=email,
            full_name=account_names[email],
            risk_level=risk_level,
            ordinal=ordinal,
            occupation_type="demo_login_account",
        )
        for email, (risk_level, ordinal) in LOGIN_ACCOUNT_RISKS.items()
    ]


def _ensure_profile(db: Session, user: User, spec: dict[str, object]) -> tuple[UserProfile, bool]:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    created = profile is None
    whr = round(float(spec["waist"]) / float(spec["hip"]), 2)
    goals = ["demo_seed", "运动促进健康", f"risk_{spec['risk_level']}"]
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)

    profile.name = str(spec["full_name"])
    profile.sex = str(spec["sex"])
    profile.birth_date = spec["birth_date"]
    profile.age = int(spec["age"])
    profile.height_cm = float(spec["height"])
    profile.weight_kg = float(spec["weight"])
    profile.bmi = float(spec["bmi"])
    profile.waist_cm = float(spec["waist"])
    profile.hip_cm = float(spec["hip"])
    profile.whr = whr
    profile.occupation_type = str(spec.get("occupation_type") or "demo_sample")
    profile.sedentary_hours = round(5.5 + (user.id % 4) * 0.5, 1)
    profile.sleep_hours = round(6.5 + (user.id % 3) * 0.4, 1)
    profile.exercise_goal = goals
    profile.exercise_habit = "规律运动" if spec["risk_level"] in {"R0", "R1"} else "偶尔运动"
    profile.exercise_experience = "入门" if spec["risk_level"] in {"R2", "R3"} else "中等"
    return profile, created


def _has_records(db: Session, model, user_id: int) -> bool:
    return _record_count(db, model, user_id) > 0


def _record_count(db: Session, model, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0


def _demo_health_timeline(user: User, spec: dict[str, object], measured_at: datetime) -> dict[str, dict[str, float | int | datetime]]:
    risk_index = RISK_LEVELS.index(str(spec["risk_level"]))
    current_weight = float(spec["weight"])
    current_height = float(spec["height"])
    current_waist = float(spec["waist"])
    current_hip = float(spec["hip"])
    baseline_weight = round(current_weight + (0.6 if risk_index == 3 else 1.2 + risk_index * 0.25), 1)
    baseline_waist = round(current_waist + (0.8 if risk_index == 3 else 1.8 + risk_index * 0.3), 1)
    baseline_hip = round(current_hip + 0.4, 1)
    current_time = measured_at + timedelta(days=28)
    return {
        "baseline": {
            "measured_at": measured_at,
            "height": current_height,
            "weight": baseline_weight,
            "bmi": round(baseline_weight / ((current_height / 100) ** 2), 1),
            "waist": baseline_waist,
            "hip": baseline_hip,
            "resting_hr": 69 + risk_index * 4 + user.id % 4,
            "sbp": 116 + risk_index * 10 + user.id % 5,
            "dbp": 74 + risk_index * 6 + user.id % 4,
            "vital_capacity": 2720 + (user.id % 12) * 80 - risk_index * 120,
            "grip_left": 24 + user.id % 8,
            "grip_right": 26 + user.id % 9,
            "sit_reach": 7 + user.id % 10 - risk_index,
            "vertical_jump": 24 + user.id % 12,
            "push_up": 9 + user.id % 18,
            "sit_up": 11 + user.id % 20,
            "single_leg_stand": 16 + user.id % 30,
            "reaction_time": round(0.4 + risk_index * 0.03, 2),
            "step_test_index": round(55 - risk_index * 4 + user.id % 5, 1),
            "six_mwt": 540 - risk_index * 45 + user.id % 20,
            "pain_score": min(6, risk_index + 1 + user.id % 3),
            "rpe_baseline": 10 + risk_index,
            "body_fat_pct": round(22.2 + risk_index * 3.5 + user.id % 4, 1),
            "skeletal_muscle_kg": round(21.4 + user.id % 7 - risk_index, 1),
            "muscle_mass_kg": round(37.4 + user.id % 8 - risk_index, 1),
            "visceral_fat_level": 8 + risk_index * 2 + user.id % 3,
            "body_water_pct": round(53.2 - risk_index * 1.5, 1),
            "fbg": round(5.0 + risk_index * 0.45 + (user.id % 3) * 0.1, 1),
            "pbg_2h": round(6.6 + risk_index * 0.8, 1),
            "hba1c": round(5.2 + risk_index * 0.35, 1),
            "tc": round(4.5 + risk_index * 0.35, 1),
            "tg": round(1.2 + risk_index * 0.28, 1),
            "hdl_c": round(1.3 - risk_index * 0.08, 1),
            "ldl_c": round(2.6 + risk_index * 0.28, 1),
        },
        "current": {
            "measured_at": current_time,
            "height": current_height,
            "weight": current_weight,
            "bmi": float(spec["bmi"]),
            "waist": current_waist,
            "hip": current_hip,
            "resting_hr": 66 + risk_index * 4 + user.id % 4,
            "sbp": 112 + risk_index * 10 + user.id % 5,
            "dbp": 72 + risk_index * 6 + user.id % 4,
            "vital_capacity": 2800 + (user.id % 12) * 80 - risk_index * 120,
            "grip_left": 25 + user.id % 8,
            "grip_right": 27 + user.id % 9,
            "sit_reach": 8 + user.id % 10 - risk_index,
            "vertical_jump": 25 + user.id % 12,
            "push_up": 10 + user.id % 18,
            "sit_up": 12 + user.id % 20,
            "single_leg_stand": 18 + user.id % 30,
            "reaction_time": round(0.38 + risk_index * 0.03, 2),
            "step_test_index": round(58 - risk_index * 4 + user.id % 5, 1),
            "six_mwt": 560 - risk_index * 45 + user.id % 20,
            "pain_score": min(6, risk_index + user.id % 3),
            "rpe_baseline": 9 + risk_index,
            "body_fat_pct": round(21 + risk_index * 3.5 + user.id % 4, 1),
            "skeletal_muscle_kg": round(22 + user.id % 7 - risk_index, 1),
            "muscle_mass_kg": round(38 + user.id % 8 - risk_index, 1),
            "visceral_fat_level": 7 + risk_index * 2 + user.id % 3,
            "body_water_pct": round(54 - risk_index * 1.5, 1),
            "fbg": round(4.8 + risk_index * 0.45 + (user.id % 3) * 0.1, 1),
            "pbg_2h": round(6.2 + risk_index * 0.8, 1),
            "hba1c": round(5.1 + risk_index * 0.35, 1),
            "tc": round(4.3 + risk_index * 0.35, 1),
            "tg": round(1.1 + risk_index * 0.28, 1),
            "hdl_c": round(1.4 - risk_index * 0.08, 1),
            "ldl_c": round(2.4 + risk_index * 0.28, 1),
        },
    }


def _missing_health_stages(existing_count: int, *, model_name: str) -> list[str]:
    if existing_count <= 0:
        return ["baseline", "current"]
    if existing_count == 1:
        return ["baseline"] if model_name == "UserProfileMeasurement" else ["current"]
    return []


def _create_health_records(db: Session, user: User, spec: dict[str, object], operator_id: int | None) -> int:
    risk_index = RISK_LEVELS.index(str(spec["risk_level"]))
    feedback_date = date.today() - timedelta(days=user.id % 5)
    measured_at = (
        datetime(feedback_date.year, feedback_date.month, feedback_date.day, 9, 0)
        - timedelta(days=28)
        + timedelta(hours=user.id % 4)
    )
    timeline = _demo_health_timeline(user, spec, measured_at)
    created = 0

    for stage in _missing_health_stages(_record_count(db, UserProfileMeasurement, user.id), model_name="UserProfileMeasurement"):
        values = timeline[stage]
        db.add(
            UserProfileMeasurement(
                user_id=user.id,
                height_cm=float(values["height"]),
                weight_kg=float(values["weight"]),
                bmi=float(values["bmi"]),
                waist_cm=float(values["waist"]),
                hip_cm=float(values["hip"]),
                whr=round(float(values["waist"]) / float(values["hip"]), 2),
                source=f"demo_seed_{stage}",
                measured_at=values["measured_at"],
            )
        )
        created += 1

    for stage in _missing_health_stages(_record_count(db, FitnessTest, user.id), model_name="FitnessTest"):
        values = timeline[stage]
        db.add(
            FitnessTest(
                user_id=user.id,
                resting_hr=int(values["resting_hr"]),
                sbp=int(values["sbp"]),
                dbp=int(values["dbp"]),
                vital_capacity=int(values["vital_capacity"]),
                grip_left=float(values["grip_left"]),
                grip_right=float(values["grip_right"]),
                sit_reach=float(values["sit_reach"]),
                vertical_jump=float(values["vertical_jump"]),
                push_up=int(values["push_up"]),
                sit_up=int(values["sit_up"]),
                single_leg_stand=float(values["single_leg_stand"]),
                reaction_time=float(values["reaction_time"]),
                step_test_index=float(values["step_test_index"]),
                six_mwt=float(values["six_mwt"]),
                pain_score=int(values["pain_score"]),
                rpe_baseline=float(values["rpe_baseline"]),
                measured_at=values["measured_at"],
                source=f"demo_seed_{stage}",
                created_by=operator_id,
            )
        )
        created += 1

    for stage in _missing_health_stages(_record_count(db, BodyComposition, user.id), model_name="BodyComposition"):
        values = timeline[stage]
        db.add(
            BodyComposition(
                user_id=user.id,
                body_fat_pct=float(values["body_fat_pct"]),
                skeletal_muscle_kg=float(values["skeletal_muscle_kg"]),
                muscle_mass_kg=float(values["muscle_mass_kg"]),
                fat_free_mass=round(float(values["weight"]) * 0.72, 1),
                visceral_fat_level=float(values["visceral_fat_level"]),
                bmr=1300 + (user.id % 16) * 18,
                body_water_pct=float(values["body_water_pct"]),
                bone_mass_kg=round(2.3 + (user.id % 6) * 0.1, 1),
                protein_pct=round(16 + (user.id % 3) * 0.4, 1),
                body_type=f"demo_seed_body_composition_{stage}",
                device_model="Demo-InBody-770",
                measured_at=values["measured_at"],
                is_fasting=True,
                operator_id=operator_id,
            )
        )
        created += 1

    for stage in _missing_health_stages(_record_count(db, BiochemicalIndex, user.id), model_name="BiochemicalIndex"):
        values = timeline[stage]
        db.add(
            BiochemicalIndex(
                user_id=user.id,
                fbg=float(values["fbg"]),
                pbg_2h=float(values["pbg_2h"]),
                hba1c=float(values["hba1c"]),
                tc=float(values["tc"]),
                tg=float(values["tg"]),
                hdl_c=float(values["hdl_c"]),
                ldl_c=float(values["ldl_c"]),
                uric_acid=320 + risk_index * 25 + user.id % 20,
                creatinine=68 + user.id % 12,
                alt=18 + risk_index * 4,
                ast=20 + risk_index * 3,
                hemoglobin=128 + user.id % 18,
                spo2=98 - min(risk_index, 2),
                measured_at=values["measured_at"],
                source=f"demo_seed_{stage}",
                report_file_url=f"demo://biochemical/{stage}/{user.email}",
            )
        )
        created += 1

    if not _has_records(db, RiskScreening, user.id):
        db.add(
            RiskScreening(
                user_id=user.id,
                has_hypertension=risk_index >= 2,
                has_diabetes=risk_index >= 3,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=risk_index == 3,
                has_osteoporosis=risk_index == 3,
                has_joint_pain=risk_index >= 1,
                pain_location=["膝"] if risk_index >= 1 else [],
                recent_injury=False,
                surgery_history="demo_seed: 无近期手术史",
                medication=["降压药"] if risk_index >= 2 else [],
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=risk_index == 3,
                palpitation=risk_index == 3,
                doctor_restriction="demo_seed: 需低强度起步" if risk_index == 3 else None,
                parq_result="POSITIVE" if risk_index >= 2 else "NEGATIVE",
                risk_level=str(spec["risk_level"]),
                risk_reasons=[f"demo_seed risk {spec['risk_level']}", "复测跟踪样本"],
                created_at=measured_at,
            )
        )
        created += 1

    if not _has_records(db, ExerciseFeedback, user.id):
        db.add(
            ExerciseFeedback(
                user_id=user.id,
                prescription_id=None,
                pre_exercise_confirmed=True,
                exercise_date=measured_at.date() + timedelta(days=28),
                exercise_type="快走+抗阻循环",
                frequency_week=3 + (user.id % 2),
                duration_min=25 + risk_index * 5,
                intensity_level="低" if risk_index >= 2 else "中",
                avg_hr=105 + risk_index * 5,
                max_hr=128 + risk_index * 4,
                pre_ex_bp_sbp=112 + risk_index * 8,
                pre_ex_bp_dbp=72 + risk_index * 5,
                post_ex_bp_sbp=118 + risk_index * 7,
                post_ex_bp_dbp=76 + risk_index * 4,
                pre_glucose=round(5.2 + risk_index * 0.4, 1),
                post_glucose=round(5.0 + risk_index * 0.3, 1),
                rpe=11 + risk_index,
                completion_rate=round(72 + (user.id % 5) * 5, 2),
                discomfort=["轻微膝部不适"] if risk_index >= 2 else [],
                discomfort_detail="demo_seed feedback: 复测前两周运动反馈",
                pain_score_after=min(5, risk_index + 1),
                source="demo_seed",
            )
        )
        created += 1
    return created


def _ensure_demo_cluster_assignment(db: Session, user: User, spec: dict[str, object]) -> bool:
    risk_level = str(spec["risk_level"])
    label = DEMO_CLUSTER_LABELS[risk_level]
    assignments = db.scalars(
        select(UserClusterAssignment)
        .where(UserClusterAssignment.user_id == user.id)
        .order_by(UserClusterAssignment.id.desc())
    ).all()
    assignment = next(
        (
            item
            for item in assignments
            if f"demo_seed_{risk_level}" in (item.rule_labels or [])
            or (item.profile_summary or "").startswith("demo_seed:")
        ),
        None,
    )
    created = assignment is None
    if assignment is None:
        assignment = UserClusterAssignment(user_id=user.id, profile_summary=DEMO_CLUSTER_SUMMARIES[risk_level])
        db.add(assignment)

    assignment.model_id = None
    assignment.rule_labels = [f"demo_seed_{risk_level}", label]
    assignment.cluster_label = label
    assignment.cluster_id = RISK_LEVELS.index(risk_level)
    assignment.profile_summary = DEMO_CLUSTER_SUMMARIES[risk_level]
    assignment.risk_override = risk_level == "R3"
    return created


def _demo_prescription_state(spec: dict[str, object]) -> tuple[str, dict | None, str | None, str | None, str]:
    risk_level = str(spec["risk_level"])
    ordinal = int(spec["ordinal"])
    fitt_vp = {
        "frequency": "每周3-5次",
        "intensity": "低到中等强度" if risk_level in {"R2", "R3"} else "中等强度",
        "time": "每次25-45分钟",
        "type": ["快走", "弹力带抗阻", "灵活性训练"],
        "volume": "每周累计150分钟左右",
        "progression": "每2周依据反馈微调",
    }
    if risk_level in {"R0", "R1"}:
        return "PUBLISHED", fitt_vp, None, None, "DEMO_AUTO_PUBLISHED"
    if risk_level == "R3":
        return "REFERRED", None, "REFERRED", "REFER", "DEMO_MEDICAL_REFERRAL"

    states = [
        ("PENDING_REVIEW", "PENDING", None, "DEMO_PENDING_EXPERT_REVIEW"),
        ("PUBLISHED", "APPROVED", "APPROVE", "DEMO_EXPERT_APPROVED"),
        ("REJECTED", "REJECTED", "REJECT", "DEMO_EXPERT_REJECTED"),
        ("NEEDS_INFO", "NEEDS_INFO", "REQUEST_INFO", "DEMO_NEEDS_MORE_DATA"),
    ]
    status, review_status, action, reason = states[ordinal % len(states)]
    return status, fitt_vp, review_status, action, reason


def _demo_template_payload(risk_level: str) -> tuple[dict | None, list[str], list[str]]:
    fitt_vp = {
        "frequency": "每周3-5次",
        "intensity": "低到中等强度" if risk_level == "R2" else "中等强度",
        "time": "每次25-45分钟",
        "type": ["快走", "弹力带抗阻", "灵活性训练"],
        "volume": "每周累计150分钟左右",
        "progression": "每2周依据反馈、RPE和血压/血糖监测结果微调",
    }
    precautions = ["demo_seed", "运动前确认血压、血糖和不适症状", "出现红旗信号立即停止并联系专业人员"]
    contraindications = ["胸痛", "晕厥", "严重气短", "异常心悸"]
    if risk_level == "R3":
        return None, ["demo_seed", "当前仅建议医学评估或专业转介"], ["不生成训练处方", *contraindications]
    if risk_level == "R2":
        precautions.append("专家审核发布前不可执行训练计划")
        contraindications.append("未审核前执行训练")
    return fitt_vp, precautions, contraindications


def ensure_demo_templates(db: Session, *, approved_by: int | None = None) -> dict[str, PrescriptionTemplate]:
    templates: dict[str, PrescriptionTemplate] = {}
    for risk_level in RISK_LEVELS:
        template_code = DEMO_TEMPLATE_CODES[risk_level]
        template = db.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.template_code == template_code))
        if template is None:
            template = PrescriptionTemplate(template_code=template_code, name=f"{DEMO_MARKER} {risk_level} 演示处方模板")
            db.add(template)

        fitt_vp, precautions, contraindications = _demo_template_payload(risk_level)
        template.name = f"{DEMO_MARKER} {risk_level} 演示处方模板"
        template.risk_level = risk_level
        template.cluster_tags = [f"demo_seed_{risk_level}"]
        template.goal_tags = ["体质提升", "风险控制", "复测跟踪"]
        template.fitt_vp = fitt_vp
        template.precautions = precautions
        template.contraindications = contraindications
        template.evidence_refs = [f"demo_seed:{risk_level}:template"]
        template.status = TemplateStatus.APPROVED
        template.version = 1
        template.source_version = "demo_seed_v1"
        template.review_status = "CONFIRMED"
        template.created_by = approved_by
        template.approved_by = approved_by
        templates[risk_level] = template
    db.flush()
    return templates


def _demo_template_for_risk(db: Session, risk_level: str) -> PrescriptionTemplate | None:
    demo_template = db.scalar(
        select(PrescriptionTemplate)
        .where(PrescriptionTemplate.template_code == DEMO_TEMPLATE_CODES.get(risk_level))
        .where(PrescriptionTemplate.status == TemplateStatus.APPROVED)
        .limit(1)
    )
    if demo_template is not None:
        return demo_template
    return db.scalar(
        select(PrescriptionTemplate)
        .where(PrescriptionTemplate.risk_level == risk_level)
        .where(PrescriptionTemplate.status == TemplateStatus.APPROVED)
        .order_by(PrescriptionTemplate.id.asc())
        .limit(1)
    )


def backfill_demo_prescription_templates(db: Session) -> int:
    updated = 0
    demo_records = db.scalars(
        select(PrescriptionRecord)
        .where(PrescriptionRecord.llm_payload["source"].as_string() == "demo_seed")
        .where(PrescriptionRecord.template_id.is_(None))
    ).all()
    for record in demo_records:
        template = _demo_template_for_risk(db, record.risk_level)
        if template is None:
            continue
        record.template_id = template.id
        updated += 1
    return updated


def clear_demo_templates(db: Session) -> int:
    return db.execute(
        delete(PrescriptionTemplate).where(PrescriptionTemplate.template_code.in_(list(DEMO_TEMPLATE_CODES.values())))
    ).rowcount or 0


def _link_feedback_to_prescription(db: Session, user_id: int, prescription_id: int) -> None:
    feedback_items = db.scalars(
        select(ExerciseFeedback).where(
            ExerciseFeedback.user_id == user_id,
            ExerciseFeedback.prescription_id.is_(None),
        )
    ).all()
    for feedback in feedback_items:
        feedback.prescription_id = prescription_id


def _create_prescription(
    db: Session,
    user: User,
    spec: dict[str, object],
    *,
    actor_id: int | None,
    expert_id: int | None,
) -> tuple[int, int]:
    if _has_records(db, PrescriptionRecord, user.id):
        existing = db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user.id)
            .order_by(PrescriptionRecord.id.desc())
            .limit(1)
        )
        if existing is not None:
            _link_feedback_to_prescription(db, user.id, existing.id)
        return 0, 0

    risk_level = str(spec["risk_level"])
    record_status, fitt_vp, review_status, review_action, change_reason = _demo_prescription_state(spec)
    ordinal = int(spec["ordinal"])
    base_time = datetime.now(UTC).replace(tzinfo=None, microsecond=0) - timedelta(hours=6)
    record_created_at = base_time - timedelta(minutes=ordinal)
    review_created_at = record_created_at + timedelta(hours=1)
    reviewed_at = review_created_at + timedelta(hours=2) if review_status not in {None, "PENDING"} else None
    review_created = 0
    template = _demo_template_for_risk(db, risk_level)
    record = PrescriptionRecord(
        user_id=user.id,
        template_id=template.id if template is not None else None,
        risk_level=risk_level,
        cluster_label=f"demo_seed_{risk_level}",
        goals=["体质提升", "风险控制", "复测跟踪"],
        fitt_vp=fitt_vp,
        precautions=["demo_seed", "运动前确认血压和不适症状"],
        contraindications=["出现胸痛、晕厥或异常气促时停止运动"] if risk_level == "R3" else [],
        reassessment="4周反馈复核，8周体质复测",
        evidence_refs=[
            {
                "source": "demo_seed",
                "risk_level": risk_level,
                "document_title": f"{risk_level} 演示证据链",
                "chunk_id": f"demo-{risk_level.lower()}-{spec['ordinal']}",
                "retrieval_mode": "demo_seed",
            }
        ],
        llm_payload={
            "source": "demo_seed",
            "sample_email": user.email,
            "risk_rules": [
                {
                    "code": f"DEMO_{risk_level}_RULE",
                    "name": f"{risk_level} 演示风险规则",
                    "severity": "RED" if risk_level == "R3" else "YELLOW" if risk_level == "R2" else "GREEN",
                    "message": f"demo_seed {risk_level} rule hit",
                    "path": "risk_screening.risk_level",
                }
            ],
            "candidate_actions": [
                {"name": "快走", "category": "有氧", "risk_level": risk_level},
                {"name": "弹力带划船", "category": "抗阻", "risk_level": risk_level},
                {"name": "灵活性训练", "category": "柔韧", "risk_level": risk_level},
            ],
        },
        safety_notice="演示数据，仅用于产品流程展示，不作为医疗建议。",
        status=record_status,
        expert_review_required=risk_level in {"R2", "R3"},
        version=1,
        created_at=record_created_at,
        updated_at=reviewed_at or record_created_at,
    )
    db.add(record)
    db.flush()
    _link_feedback_to_prescription(db, user.id, record.id)
    db.add(
        PrescriptionVersion(
            prescription_id=record.id,
            version=1,
            snapshot={
                "source": "demo_seed",
                "risk_level": risk_level,
                "goals": record.goals,
                "fitt_vp": record.fitt_vp,
                "status": record.status,
            },
            change_reason=change_reason,
            actor_id=actor_id,
            created_at=record_created_at,
        )
    )
    if review_status is not None:
        db.add(
            ExpertReview(
                prescription_id=record.id,
                user_id=user.id,
                expert_id=expert_id if review_status != "PENDING" else None,
                status=review_status,
                review_comment={
                    "PENDING": "demo_seed: 待专家开始审核。",
                    "APPROVED": "demo_seed: 已核对风险规则、禁忌动作和处方强度。",
                    "REJECTED": "demo_seed: 运动风险资料不足，驳回重新生成。",
                    "NEEDS_INFO": "demo_seed: 需要补充近期血压和疼痛记录。",
                    "REFERRED": "demo_seed: R3 风险，建议医学评估/转介。",
                }[review_status],
                edited_prescription={"source": "demo_seed", "status": record.status},
                action=review_action,
                created_at=review_created_at,
                reviewed_at=reviewed_at,
            )
        )
        review_created = 1
    return 2, review_created


def _ensure_demo_export_requests(
    db: Session,
    *,
    researcher_id: int,
    admin_id: int,
    organization_id: int,
) -> int:
    existing = db.scalar(
        select(func.count())
        .select_from(ResearchExportRequest)
        .where(ResearchExportRequest.requested_by == researcher_id)
        .where(ResearchExportRequest.purpose.like("demo_seed:%"))
    )
    if existing:
        return 0

    created_at = datetime(2026, 6, 3, 11, 0)
    snapshot = [
        {
            "participant_code": "DEMO-R2-001",
            "risk_level": "R2",
            "format_note": "demo_seed desensitized snapshot",
        }
    ]
    requests = [
        ResearchExportRequest(
            requested_by=researcher_id,
            organization_id=organization_id,
            format="csv",
            purpose="demo_seed: 阶段干预 CSV 数据申请",
            status="PENDING",
            row_count=40,
            created_at=created_at,
        ),
        ResearchExportRequest(
            requested_by=researcher_id,
            organization_id=organization_id,
            format="xlsx",
            purpose="demo_seed: 管理员已批准 Excel 脱敏数据",
            status="APPROVED",
            approved_by=admin_id,
            approval_comment="demo_seed: 同意用于试点汇报。",
            row_count=len(snapshot),
            snapshot_json=snapshot,
            expires_at=created_at + timedelta(hours=24),
            created_at=created_at + timedelta(minutes=1),
            updated_at=created_at + timedelta(minutes=1),
        ),
        ResearchExportRequest(
            requested_by=researcher_id,
            organization_id=organization_id,
            format="json",
            purpose="demo_seed: 用途不完整的 JSON 申请",
            status="REJECTED",
            approved_by=admin_id,
            approval_comment="demo_seed: 需补充伦理审批编号。",
            row_count=40,
            snapshot_json=[],
            created_at=created_at + timedelta(minutes=2),
            updated_at=created_at + timedelta(minutes=2),
        ),
        ResearchExportRequest(
            requested_by=researcher_id,
            organization_id=organization_id,
            format="json",
            purpose="demo_seed: 已过期的 JSON 下载任务",
            status="EXPIRED",
            approved_by=admin_id,
            approval_comment="demo_seed: 曾批准，当前已过期。",
            row_count=len(snapshot),
            snapshot_json=snapshot,
            expires_at=created_at - timedelta(hours=1),
            created_at=created_at + timedelta(minutes=3),
            updated_at=created_at + timedelta(minutes=3),
        ),
    ]
    db.add_all(requests)
    return len(requests)


def _demo_user_ids(db: Session) -> list[int]:
    organization = db.scalar(select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME))
    if organization is None:
        return []
    return list(
        db.scalars(
            select(User.id)
            .where(User.organization_id == organization.id)
            .where(User.email.like("demo-%@example.com"))
            .where(User.full_name.like(f"{DEMO_MARKER}%"))
        ).all()
    )


def clear_demo_data(db: Session) -> dict[str, dict[str, int]]:
    result = _empty_result()
    user_ids = _demo_user_ids(db)
    if not user_ids:
        result["templates"]["deleted"] += clear_demo_templates(db)
        organization = db.scalar(select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME))
        if organization is not None:
            remaining_users = db.scalar(
                select(func.count()).select_from(User).where(User.organization_id == organization.id)
            )
            if remaining_users == 0:
                db.delete(organization)
                result["organizations"]["deleted"] = 1
                db.commit()
        return result

    prescription_ids = db.scalars(
        select(PrescriptionRecord.id).where(PrescriptionRecord.user_id.in_(user_ids))
    ).all()
    result["audit_logs"]["deleted"] += db.execute(
        delete(AuditLog).where(AuditLog.actor_id.in_(user_ids))
    ).rowcount or 0
    result["auth_tokens"]["deleted"] += db.execute(
        delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids))
    ).rowcount or 0
    result["consents"]["deleted"] += db.execute(
        delete(UserConsent).where(UserConsent.user_id.in_(user_ids))
    ).rowcount or 0
    result["report_exports"]["deleted"] += db.execute(
        delete(ReportExportRecord).where(
            or_(
                ReportExportRecord.user_id.in_(user_ids),
                ReportExportRecord.exported_by.in_(user_ids),
            )
        )
    ).rowcount or 0
    result["export_requests"]["deleted"] += db.execute(
        delete(ResearchExportRequest).where(
            or_(
                ResearchExportRequest.requested_by.in_(user_ids),
                ResearchExportRequest.approved_by.in_(user_ids),
            )
        )
    ).rowcount or 0
    result["clusters"]["deleted"] += db.execute(
        delete(UserClusterAssignment).where(UserClusterAssignment.user_id.in_(user_ids))
    ).rowcount or 0
    if prescription_ids:
        result["reviews"]["deleted"] += db.execute(
            delete(ExpertReview).where(ExpertReview.prescription_id.in_(prescription_ids))
        ).rowcount or 0
        result["prescriptions"]["deleted"] += db.execute(
            delete(PrescriptionVersion).where(PrescriptionVersion.prescription_id.in_(prescription_ids))
        ).rowcount or 0
    result["prescriptions"]["deleted"] += db.execute(
        delete(PrescriptionRecord).where(PrescriptionRecord.user_id.in_(user_ids))
    ).rowcount or 0
    result["templates"]["deleted"] += clear_demo_templates(db)

    for model in [
        ExerciseFeedback,
        RiskScreening,
        BiochemicalIndex,
        BodyComposition,
        FitnessTest,
        UserProfileMeasurement,
    ]:
        result["health_records"]["deleted"] += db.execute(
            delete(model).where(model.user_id.in_(user_ids))
        ).rowcount or 0

    result["profiles"]["deleted"] += db.execute(
        delete(UserProfile).where(UserProfile.user_id.in_(user_ids))
    ).rowcount or 0
    db.execute(delete(ExpertProfile).where(ExpertProfile.user_id.in_(user_ids)))
    result["users"]["deleted"] += db.execute(delete(User).where(User.id.in_(user_ids))).rowcount or 0

    organization = db.scalar(select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME))
    if organization is not None:
        remaining_users = db.scalar(
            select(func.count()).select_from(User).where(User.organization_id == organization.id)
        )
        if remaining_users == 0:
            db.delete(organization)
            result["organizations"]["deleted"] = 1
    db.commit()
    return result


def seed_demo_data(db: Session, *, clear: bool = False) -> dict[str, dict[str, int]]:
    result = _empty_result()
    if clear:
        cleared = clear_demo_data(db)
        for category, values in cleared.items():
            for key, value in values.items():
                result[category][key] += value

    organization, organization_created = ensure_demo_organization(db)
    result["organizations"]["created"] += int(organization_created)

    demo_users: dict[str, User] = {}
    for email, full_name, role in DEMO_ACCOUNTS:
        user, created = _ensure_user(
            db,
            email=email,
            full_name=full_name,
            role=role,
            organization_id=organization.id,
        )
        demo_users[email] = user
        result["users"]["created" if created else "updated"] += int(created)

    operator_id = demo_users["demo-expert@example.com"].id
    admin_id = demo_users["demo-admin@example.com"].id
    researcher_id = demo_users["demo-researcher@example.com"].id
    existing_demo_template_count = db.scalar(
        select(func.count())
        .select_from(PrescriptionTemplate)
        .where(PrescriptionTemplate.template_code.in_(list(DEMO_TEMPLATE_CODES.values())))
    ) or 0
    ensure_demo_templates(db, approved_by=admin_id)
    result["templates"]["created"] += max(0, len(RISK_LEVELS) - int(existing_demo_template_count))
    result["templates"]["updated"] += min(len(RISK_LEVELS), int(existing_demo_template_count))

    for spec in _login_account_specs():
        user = demo_users[str(spec["email"])]
        _, profile_created = _ensure_profile(db, user, spec)
        result["profiles"]["created" if profile_created else "updated"] += 1
        cluster_created = _ensure_demo_cluster_assignment(db, user, spec)
        result["clusters"]["created" if cluster_created else "updated"] += 1
        result["health_records"]["created"] += _create_health_records(
            db, user, spec, operator_id=operator_id
        )
        prescription_created, review_created = _create_prescription(
            db,
            user,
            spec,
            actor_id=admin_id,
            expert_id=operator_id,
        )
        result["prescriptions"]["created"] += prescription_created
        result["reviews"]["created"] += review_created

    for spec in _sample_specs():
        user, created = _ensure_user(
            db,
            email=str(spec["email"]),
            full_name=str(spec["full_name"]),
            role=UserRole.USER,
            organization_id=organization.id,
        )
        result["users"]["created" if created else "updated"] += int(created)
        _, profile_created = _ensure_profile(db, user, spec)
        result["profiles"]["created" if profile_created else "updated"] += 1
        cluster_created = _ensure_demo_cluster_assignment(db, user, spec)
        result["clusters"]["created" if cluster_created else "updated"] += 1
        result["health_records"]["created"] += _create_health_records(
            db, user, spec, operator_id=operator_id
        )
        prescription_created, review_created = _create_prescription(
            db,
            user,
            spec,
            actor_id=admin_id,
            expert_id=operator_id,
        )
        result["prescriptions"]["created"] += prescription_created
        result["reviews"]["created"] += review_created

    result["export_requests"]["created"] += _ensure_demo_export_requests(
        db,
        researcher_id=researcher_id,
        admin_id=admin_id,
        organization_id=organization.id,
    )
    result["templates"]["updated"] += backfill_demo_prescription_templates(db)

    db.commit()
    return result


def main() -> None:
    parser = ArgumentParser(description="Seed demo accounts and synthetic user health data.")
    parser.add_argument("--clear", action="store_true", help="Clear existing demo data before seeding.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = seed_demo_data(db, clear=args.clear)
        print(
            "Seeded demo data: "
            f"organizations_created={result['organizations']['created']}, "
            f"organizations_deleted={result['organizations']['deleted']}, "
            f"users_created={result['users']['created']}, "
            f"users_updated={result['users']['updated']}, "
            f"users_deleted={result['users']['deleted']}, "
            f"health_records_created={result['health_records']['created']}, "
            f"prescriptions_created={result['prescriptions']['created']}, "
            f"reviews_created={result['reviews']['created']}, "
            f"export_requests_created={result['export_requests']['created']}. "
            "Demo accounts are marked with [DEMO] names under the demo organization."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
