from fastapi.testclient import TestClient

from app.core.readiness import ComponentStatus, ReadinessReport
from app.main import app


def test_health_check_returns_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
