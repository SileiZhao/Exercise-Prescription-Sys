from fastapi.testclient import TestClient

from app.core.readiness import ComponentStatus, ReadinessReport
from app.main import app


def test_health_check_returns_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_loopback_frontend_origin():
    client = TestClient(app)

    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_cors_allows_lan_frontend_origin():
    client = TestClient(app)

    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://192.168.2.15:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://192.168.2.15:5173"


def test_readiness_check_returns_dependency_components(monkeypatch):
    client = TestClient(app)

    def fake_run_checks():
        return ReadinessReport(
            status="ok",
            components={
                "database": ComponentStatus(status="ok"),
                "redis": ComponentStatus(status="ok"),
                "qdrant": ComponentStatus(status="ok"),
                "minio": ComponentStatus(status="ok"),
                "llm": ComponentStatus(status="ok", detail="mock provider"),
            },
        )

    monkeypatch.setattr("app.main.ReadinessService.run_checks", lambda self: fake_run_checks())

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert set(response.json()["components"]) == {"database", "redis", "qdrant", "minio", "llm"}


def test_readiness_check_exposes_sanitized_runtime_provider_summary(monkeypatch):
    client = TestClient(app)

    def fake_run_checks():
        return ReadinessReport(
            status="ok",
            components={
                "database": ComponentStatus(status="ok"),
                "redis": ComponentStatus(status="ok"),
                "qdrant": ComponentStatus(status="ok"),
                "minio": ComponentStatus(status="ok"),
                "llm": ComponentStatus(status="ok", detail="aliyun:qwen-prod"),
            },
        )

    monkeypatch.setattr("app.main.ReadinessService.run_checks", lambda self: fake_run_checks())
    monkeypatch.setattr(
        "app.main.runtime_provider_summary",
        lambda runtime_settings: {
            "environment": "production",
            "env_file": "/workspace/.env",
            "llm": {
                "provider": "aliyun",
                "model": "qwen-prod",
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "configured": True,
            },
            "embedding": {
                "provider": "dashscope",
                "model": "text-embedding-v4",
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "configured": True,
            },
            "ocr": {"provider": "paddleocr", "enabled": True},
        },
    )

    response = client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["runtime"]["llm"]["provider"] == "aliyun"
    assert body["runtime"]["llm"]["model"] == "qwen-prod"
    assert body["runtime"]["embedding"]["provider"] == "dashscope"
    assert body["runtime"]["ocr"]["enabled"] is True
    assert "api_key" not in str(body)
    assert "DASHSCOPE_API_KEY" not in str(body)
    assert "dashscope-secret" not in str(body)
    assert "mock" not in body["runtime"]["llm"]["provider"]
    assert "ollama" not in body["runtime"]["llm"]["provider"]


def test_readiness_check_returns_503_when_required_dependency_fails(monkeypatch):
    client = TestClient(app)

    def fake_run_checks():
        return ReadinessReport(
            status="unready",
            components={
                "database": ComponentStatus(status="down", detail="connection refused"),
                "redis": ComponentStatus(status="ok"),
                "qdrant": ComponentStatus(status="ok"),
                "minio": ComponentStatus(status="ok"),
                "llm": ComponentStatus(status="ok", detail="mock provider"),
            },
        )

    monkeypatch.setattr("app.main.ReadinessService.run_checks", lambda self: fake_run_checks())

    response = client.get("/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "unready"
    assert response.json()["components"]["database"]["status"] == "down"
