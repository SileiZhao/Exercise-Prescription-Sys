import pytest

from app.core.config import Settings
from app.models.health_data import UserProfile, UserProfileMeasurement
from scripts.smoke_real_llm_prescription import (
    _upsert_smoke_user,
    assert_real_llm_evidence_provider,
    require_real_llm_provider,
)

SMOKE_PROFILE_NAME = "[SMOKE] 真实 LLM 烟测用户"


def test_real_llm_smoke_rejects_mock_provider() -> None:
    with pytest.raises(RuntimeError, match="not 'mock'"):
        require_real_llm_provider(Settings(_env_file=None, LLM_PROVIDER="mock"))


def test_real_llm_smoke_rejects_local_ollama_provider() -> None:
    with pytest.raises(RuntimeError, match="aliyun/dashscope/openai-compatible"):
        require_real_llm_provider(Settings(_env_file=None, LLM_PROVIDER="ollama"))


def test_real_llm_smoke_rejects_local_evidence_provider() -> None:
    with pytest.raises(RuntimeError, match="Expected aliyun/dashscope/openai-compatible"):
        assert_real_llm_evidence_provider("ollama")


def test_real_llm_smoke_rejects_mismatched_evidence_provider() -> None:
    with pytest.raises(RuntimeError, match="Expected LLM evidence provider 'aliyun'"):
        assert_real_llm_evidence_provider("openai-compatible", expected_provider="aliyun")


def test_real_llm_smoke_accepts_aliyun_provider() -> None:
    require_real_llm_provider(
        Settings(_env_file=None, LLM_PROVIDER="aliyun", DASHSCOPE_API_KEY="dashscope-test-key")
    )


def test_real_llm_smoke_accepts_dashscope_evidence_provider() -> None:
    assert_real_llm_evidence_provider("dashscope")


def test_real_llm_smoke_marks_seeded_user_and_measurements_as_smoke(db_session) -> None:
    user = _upsert_smoke_user(db_session)

    profile = db_session.query(UserProfile).filter(UserProfile.user_id == user.id).one()
    measurement = db_session.query(UserProfileMeasurement).filter(UserProfileMeasurement.user_id == user.id).one()
    assert user.full_name == SMOKE_PROFILE_NAME
    assert profile.name == SMOKE_PROFILE_NAME
    assert SMOKE_PROFILE_NAME.startswith("[SMOKE]")
    assert measurement.source == "real_llm_smoke"
