"""Fail fast when production runtime is configured with non-production providers."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import Settings, runtime_provider_summary, settings
from app.core.readiness import ReadinessService

PRODUCTION_BLOCKED_LLM_MOCK = "mock LLM provider is not allowed in production"
PRODUCTION_BLOCKED_EMBEDDING_HASH = "hash embedding provider is not allowed in production"
PRODUCTION_BLOCKED_OCR_DISABLED = "OCR must be enabled in production"


def validate_production_runtime(config: Settings = settings) -> dict[str, Any]:
    runtime = runtime_provider_summary(config)
    blocking_errors: list[str] = []
    service = ReadinessService(settings=config)

    if config.ENVIRONMENT.strip().lower() == "production":
        for check in (service.check_llm(), service.check_embedding(), service.check_ocr()):
            if check.status != "ok" and check.detail:
                blocking_errors.append(check.detail)

    payload = {
        "status": "blocked" if blocking_errors else "ok",
        "environment": config.ENVIRONMENT,
        "runtime": runtime,
        "blocking_errors": blocking_errors,
    }
    if blocking_errors:
        raise RuntimeError(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return payload


def main() -> int:
    try:
        payload = validate_production_runtime(settings)
    except RuntimeError as exc:
        print(str(exc))
        return 1
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
