import json

import pytest

from app.core.config import Settings
from scripts.verify_production_runtime import validate_production_runtime


def test_production_runtime_guard_rejects_mock_hash_and_disabled_ocr() -> None:
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_runtime(
            Settings(
                _env_file=None,
                ENVIRONMENT="production",
                LLM_PROVIDER="mock",
                EMBEDDING_PROVIDER="hash",
                OCR_ENABLED=False,
            )
        )

    payload = json.loads(str(exc_info.value))
    assert payload["status"] == "blocked"
    assert "mock LLM provider is not allowed in production" in payload["blocking_errors"]
    assert "hash embedding provider is not allowed in production" in payload["blocking_errors"]
    assert "OCR must be enabled in production" in payload["blocking_errors"]
    assert "api_key" not in str(payload["runtime"])
    assert "secret" not in str(payload).lower()


def test_production_runtime_guard_allows_development_mock() -> None:
    payload = validate_production_runtime(
        Settings(
            _env_file=None,
            ENVIRONMENT="development",
            LLM_PROVIDER="mock",
            EMBEDDING_PROVIDER="hash",
            OCR_ENABLED=False,
        )
    )

    assert payload["status"] == "ok"
    assert payload["blocking_errors"] == []
    assert payload["runtime"]["llm"]["provider"] == "mock"
