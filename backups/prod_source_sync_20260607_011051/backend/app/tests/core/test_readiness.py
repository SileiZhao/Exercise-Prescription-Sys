from app.core.config import Settings
from app.core.readiness import ComponentStatus, ReadinessService


def test_llm_readiness_accepts_mock_provider() -> None:
    service = ReadinessService(settings=Settings(LLM_PROVIDER="mock"))

    status = service.check_llm()

    assert status.status == "ok"
    assert status.detail == "mock provider"


def test_llm_readiness_rejects_mock_provider_in_production() -> None:
    service = ReadinessService(settings=Settings(ENVIRONMENT="production", LLM_PROVIDER="mock"))

    status = service.check_llm()

    assert status.status == "down"
    assert "mock" in status.detail
    assert "production" in status.detail


def test_llm_readiness_rejects_local_provider_in_production(monkeypatch) -> None:
    def should_not_probe_ollama(url: str, timeout: int):
        raise AssertionError("production readiness must not probe local LLM providers")

    monkeypatch.setattr("app.core.readiness.httpx.get", should_not_probe_ollama)
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            LLM_PROVIDER="ollama",
            OLLAMA_BASE_URL="http://ollama:11434",
            LOCAL_LLM_MODEL="gemma3:latest",
        )
    )

    status = service.check_llm()

    assert status.status == "down"
    assert "ollama" in status.detail
    assert "production" in status.detail


def test_llm_readiness_requires_api_key_for_aliyun_provider() -> None:
    service = ReadinessService(
        settings=Settings(
            _env_file=None,
            LLM_PROVIDER="aliyun",
            LLM_API_KEY=None,
            DASHSCOPE_API_KEY=None,
            ALIYUN_API_KEY=None,
        )
    )

    status = service.check_llm()

    assert status.status == "down"
    assert "API key" in status.detail


def test_llm_readiness_rejects_openai_compatible_without_base_url() -> None:
    service = ReadinessService(
        settings=Settings(
            LLM_PROVIDER="openai-compatible",
            LLM_API_KEY="test-key",
            LLM_BASE_URL=None,
        )
    )

    status = service.check_llm()

    assert status.status == "down"
    assert "LLM_BASE_URL" in status.detail


def test_production_readiness_fails_when_secret_key_is_default(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="change-me-in-production",
            LLM_PROVIDER="aliyun",
            DASHSCOPE_API_KEY="dashscope-test-key",
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "unready"
    assert report.components["secret_key"].status == "down"
    assert "SECRET_KEY" in report.components["secret_key"].detail


def test_production_readiness_passes_with_non_mock_llm_and_runtime_secrets(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="production-secret",
            LLM_PROVIDER="aliyun",
            DASHSCOPE_API_KEY="dashscope-test-key",
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            OCR_ENABLED=True,
            RESEARCH_EXPORT_SALT="production-research-export-salt",
            MINIO_ACCESS_KEY="production-minio-access",
            MINIO_SECRET_KEY="production-minio-secret",
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "ok"
    assert report.components["secret_key"].status == "ok"
    assert report.components["llm"].status == "ok"


def test_production_readiness_fails_when_research_export_salt_is_default(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="production-secret",
            LLM_PROVIDER="aliyun",
            DASHSCOPE_API_KEY="dashscope-test-key",
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            OCR_ENABLED=True,
            RESEARCH_EXPORT_SALT="change-me-research-export-salt",
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "unready"
    assert report.components["production_config"].status == "down"
    assert "RESEARCH_EXPORT_SALT" in report.components["production_config"].detail


def test_production_readiness_rejects_disabled_vector_search(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="production-secret",
            LLM_PROVIDER="aliyun",
            DASHSCOPE_API_KEY="dashscope-test-key",
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            OCR_ENABLED=True,
            RESEARCH_EXPORT_SALT="production-salt",
            RAG_VECTOR_SEARCH_ENABLED=False,
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "unready"
    assert report.components["production_config"].status == "down"
    assert "RAG_VECTOR_SEARCH_ENABLED" in report.components["production_config"].detail


def test_llm_readiness_accepts_dashscope_key_alias() -> None:
    service = ReadinessService(
        settings=Settings(LLM_PROVIDER="aliyun", DASHSCOPE_API_KEY="dashscope-test-key")
    )

    status = service.check_llm()

    assert status.status == "ok"
    assert "qwen" in status.detail
    assert "aliyun" in status.detail
    assert "DASHSCOPE_API_KEY" in status.detail


def test_ready_report_exposes_actual_non_mock_runtime_provider(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="production-secret",
            LLM_PROVIDER="dashscope",
            DASHSCOPE_API_KEY="dashscope-test-key",
            LLM_MODEL="qwen-prod",
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            OCR_ENABLED=True,
            RESEARCH_EXPORT_SALT="production-research-export-salt",
            MINIO_ACCESS_KEY="production-minio-access",
            MINIO_SECRET_KEY="production-minio-secret",
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "ok"
    assert report.components["llm"].detail is not None
    assert "dashscope:qwen-prod" in report.components["llm"].detail
    assert "mock" not in report.components["llm"].detail
    assert "ollama:" not in report.components["llm"].detail


def test_llm_readiness_accepts_ollama_when_model_is_available(monkeypatch) -> None:
    calls = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"models": [{"name": "gemma3:latest"}, {"name": "nomic-embed-text"}]}

    def fake_get(url: str, timeout: int):
        calls.append({"url": url, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("app.core.readiness.httpx.get", fake_get)
    service = ReadinessService(
        settings=Settings(
            LLM_PROVIDER="ollama",
            OLLAMA_BASE_URL="http://ollama:11434",
            LOCAL_LLM_MODEL="gemma3:latest",
        )
    )

    status = service.check_llm()

    assert status.status == "ok"
    assert status.detail == "ollama:gemma3:latest"
    assert calls == [{"url": "http://ollama:11434/api/tags", "timeout": 1}]


def test_llm_readiness_rejects_ollama_when_model_is_missing(monkeypatch) -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"models": [{"name": "gemma:latest"}]}

    monkeypatch.setattr("app.core.readiness.httpx.get", lambda url, timeout: FakeResponse())
    service = ReadinessService(
        settings=Settings(
            LLM_PROVIDER="ollama",
            OLLAMA_BASE_URL="http://ollama:11434",
            LOCAL_LLM_MODEL="gemma3:latest",
        )
    )

    status = service.check_llm()

    assert status.status == "down"
    assert "ollama pull gemma3:latest" in status.detail


def test_qdrant_readiness_uses_http_endpoint_without_sdk(monkeypatch) -> None:
    calls = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, timeout: int):
        calls.append({"url": url, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("app.core.readiness.httpx.get", fake_get)
    service = ReadinessService(settings=Settings(QDRANT_URL="http://qdrant:6333"))

    status = service.check_qdrant()

    assert status.status == "ok"
    assert calls == [{"url": "http://qdrant:6333/collections", "timeout": 1}]


def test_embedding_readiness_rejects_hash_provider_in_production() -> None:
    service = ReadinessService(settings=Settings(ENVIRONMENT="production", EMBEDDING_PROVIDER="hash"))

    status = service.check_embedding()

    assert status.status == "down"
    assert "hash" in status.detail
    assert "production" in status.detail


def test_embedding_readiness_rejects_ollama_provider_in_production() -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            EMBEDDING_PROVIDER="ollama",
            EMBEDDING_MODEL="nomic-embed-text",
        )
    )

    status = service.check_embedding()

    assert status.status == "down"
    assert "ollama" in status.detail
    assert "production" in status.detail


def test_embedding_readiness_accepts_dashscope_key_alias() -> None:
    service = ReadinessService(
        settings=Settings(
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            DASHSCOPE_API_KEY="dashscope-test-key",
        )
    )

    status = service.check_embedding()

    assert status.status == "ok"
    assert "dashscope:text-embedding-v4" in status.detail
    assert "DASHSCOPE_API_KEY" in status.detail


def test_ocr_readiness_rejects_disabled_ocr_in_production() -> None:
    service = ReadinessService(settings=Settings(ENVIRONMENT="production", OCR_ENABLED=False))

    status = service.check_ocr()

    assert status.status == "down"
    assert "OCR" in status.detail
    assert "production" in status.detail


def test_readiness_report_includes_embedding_component(monkeypatch) -> None:
    service = ReadinessService(
        settings=Settings(
            ENVIRONMENT="production",
            SECRET_KEY="production-secret",
            LLM_PROVIDER="aliyun",
            DASHSCOPE_API_KEY="dashscope-test-key",
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            OCR_ENABLED=True,
            RESEARCH_EXPORT_SALT="production-research-export-salt",
            MINIO_ACCESS_KEY="production-minio-access",
            MINIO_SECRET_KEY="production-minio-secret",
        )
    )
    monkeypatch.setattr(service, "check_database", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_redis", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_qdrant", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_minio", lambda: ComponentStatus(status="ok"))
    monkeypatch.setattr(service, "check_embedding", lambda: ComponentStatus(status="ok", detail="dashscope:text-embedding-v4"))
    monkeypatch.setattr(service, "check_ocr", lambda: ComponentStatus(status="ok", detail="paddleocr:enabled"))

    report = service.run_checks()

    assert report.status == "ok"
    assert report.components["embedding"].status == "ok"
    assert report.components["embedding"].detail == "dashscope:text-embedding-v4"
