"""Run a real LLM prescription smoke test against the configured database."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, runtime_provider_summary, settings
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    FitnessTest,
    RiskScreening,
    UserProfile,
    UserProfileMeasurement,
)
from app.models.prescription import PrescriptionEvidence
from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus
from app.models.user import User
from app.services.knowledge_service import KnowledgeIngestionService
from app.services.prescription_orchestrator import PrescriptionOrchestrator

SMOKE_EMAIL = "real-llm-smoke@example.com"
SMOKE_PROFILE_NAME = "[SMOKE] 真实 LLM 烟测用户"
REMOTE_LLM_PROVIDERS = {"aliyun", "dashscope", "qwen", "openai-compatible", "openai"}


def require_real_llm_provider(config: Settings) -> None:
    provider = config.LLM_PROVIDER.strip().lower()
    if provider not in REMOTE_LLM_PROVIDERS:
        raise RuntimeError(
            "Real LLM smoke requires LLM_PROVIDER to be aliyun/dashscope/openai-compatible, "
            f"not {config.LLM_PROVIDER!r}."
        )


def assert_real_llm_evidence_provider(provider: str, *, expected_provider: str | None = None) -> None:
    normalized = provider.strip().lower()
    if normalized not in REMOTE_LLM_PROVIDERS:
        raise RuntimeError(
            "Expected aliyun/dashscope/openai-compatible LLM evidence provider, "
            f"got {provider!r}."
        )
    if expected_provider is not None:
        expected = expected_provider.strip().lower()
        if normalized != expected:
            raise RuntimeError(
                f"Expected LLM evidence provider {expected!r}, got {provider!r}."
            )


def _safe_smoke_runtime_summary(runtime: dict) -> dict:
    return {key: runtime[key] for key in ("provider", "model", "base_url") if key in runtime}


def run_smoke(db: Session) -> dict:
    require_real_llm_provider(settings)
    user = _upsert_smoke_user(db)
    _seed_minimal_reference_data(db)
    record = PrescriptionOrchestrator(db).generate_for_user(user.id)
    evidence = db.scalar(select(PrescriptionEvidence).where(PrescriptionEvidence.prescription_id == record.id))
    if evidence is None:
        raise RuntimeError("PrescriptionEvidence was not created.")
    assert_real_llm_evidence_provider(evidence.llm_provider, expected_provider=settings.LLM_PROVIDER)
    return {
        "prescription_id": record.id,
        "status": record.status,
        "risk_level": record.risk_level,
        "llm_provider": evidence.llm_provider,
        "llm_model": evidence.llm_model,
    }


def _upsert_smoke_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == SMOKE_EMAIL))
    if user is None:
        user = User(
            email=SMOKE_EMAIL,
            hashed_password=get_password_hash("SmokePass123"),
            full_name=SMOKE_PROFILE_NAME,
            role=UserRole.USER,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = SMOKE_PROFILE_NAME
        user.is_active = True
        user.is_verified = True
    _upsert_profile(db, user.id)
    _replace_latest_inputs(db, user.id)
    db.commit()
    db.refresh(user)
    return user


def _upsert_profile(db: Session, user_id: int) -> None:
    bmi = round(82 / (1.7**2), 2)
    whr = round(96 / 102, 2)
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    payload = {
        "name": SMOKE_PROFILE_NAME,
        "sex": "男",
        "birth_date": date(1988, 1, 1),
        "age": 38,
        "height_cm": 170,
        "weight_kg": 82,
        "bmi": bmi,
        "waist_cm": 96,
        "hip_cm": 102,
        "whr": whr,
        "exercise_goal": ["减脂", "增强心肺"],
        "exercise_habit": "无规律运动",
        "exercise_experience": "初级",
    }
    if profile is None:
        db.add(UserProfile(user_id=user_id, **payload))
    else:
        for key, value in payload.items():
            setattr(profile, key, value)
    db.add(
        UserProfileMeasurement(
            user_id=user_id,
            height_cm=170,
            weight_kg=82,
            bmi=bmi,
            waist_cm=96,
            hip_cm=102,
            whr=whr,
            source="real_llm_smoke",
        )
    )


def _replace_latest_inputs(db: Session, user_id: int) -> None:
    db.add_all(
        [
            FitnessTest(user_id=user_id, resting_hr=78, sbp=128, dbp=82, pain_score=1),
            BodyComposition(user_id=user_id, body_fat_pct=31, skeletal_muscle_kg=25, visceral_fat_level=12),
            BiochemicalIndex(user_id=user_id, fbg=5.8, tc=5.0, tg=1.5, hdl_c=1.1, ldl_c=3.0),
            RiskScreening(
                user_id=user_id,
                has_hypertension=False,
                has_diabetes=False,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=False,
                has_joint_pain=False,
                recent_injury=False,
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=False,
                palpitation=False,
                medication=[],
            ),
        ]
    )


def _seed_minimal_reference_data(db: Session) -> None:
    template = db.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.name == "真实 LLM 烟测 R1 模板"))
    if template is None:
        db.add(
            PrescriptionTemplate(
                name="真实 LLM 烟测 R1 模板",
                risk_level="R1",
                cluster_tags=["肥胖代谢风险型", "初级运动水平", "普通健康维持型"],
                goal_tags=["减脂", "增强心肺"],
                fitt_vp={
                    "frequency": "每周4次",
                    "intensity": "低—中等强度",
                    "time": "每次30分钟",
                    "type": ["快走", "八段锦"],
                    "volume": "每周120分钟",
                    "progression": "每2-4周按反馈调整",
                },
                precautions=["监测RPE", "出现胸闷头晕立即停止"],
                contraindications=["高强度冲刺"],
                status=TemplateStatus.APPROVED,
                version=1,
            )
        )
    action = db.scalar(select(ExerciseAction).where(ExerciseAction.name == "真实 LLM 烟测快走"))
    if action is None:
        db.add(
            ExerciseAction(
                name="真实 LLM 烟测快走",
                category="有氧",
                risk_level="R1",
                suitable_tags=["减脂", "增强心肺", "初级运动水平"],
                contraindication_tags=["胸痛"],
                body_parts=["下肢", "心肺"],
                impact_level="低",
                joint_stress_level="低",
                intensity="低-中",
                instructions="平地快走，保持可交谈强度。",
                status=ActionReviewStatus.APPROVED,
            )
        )
    db.commit()
    KnowledgeIngestionService(db).ingest_text(
        title="真实 LLM 烟测低风险运动建议",
        category="运动处方",
        content="低风险或轻度代谢风险用户可从低到中等强度有氧运动开始，结合八段锦，并监测RPE。",
        tags=["R1", "减脂", "增强心肺", "八段锦"],
        created_by=None,
    )


def main() -> None:
    summary = runtime_provider_summary(settings)
    with SessionLocal() as db:
        result = run_smoke(db)
    print(json.dumps({"runtime": _safe_smoke_runtime_summary(summary["llm"]), "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
