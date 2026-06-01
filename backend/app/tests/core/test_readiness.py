from app.core.config import Settings
from app.core.readiness import ReadinessService


def test_llm_readiness_accepts_mock_provider() -> None:
    service = ReadinessService(settings=Settings(LLM_PROVIDER="mock"))

    status = service.check_llm()

    assert status.status == "ok"
    assert status.detail == "mock provider"


def test_llm_readiness_requires_api_key_for_aliyun_provider() -> None:
    service = ReadinessService(
        settings=Settings(LLM_PROVIDER="aliyun", DASHSCOPE_API_KEY=None, ALIYUN_API_KEY=None)
    )

    status = service.check_llm()

    assert status.status == "down"
    assert "API key" in status.detail


def test_llm_readiness_accepts_dashscope_key_alias() -> None:
    service = ReadinessService(
        settings=Settings(LLM_PROVIDER="aliyun", DASHSCOPE_API_KEY="dashscope-test-key")
    )

    status = service.check_llm()

    assert status.status == "ok"
    assert "qwen" in status.detail


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
