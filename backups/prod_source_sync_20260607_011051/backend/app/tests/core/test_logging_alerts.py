import json
import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import ErrorAlertService, JsonLogFormatter, log_runtime_provider_summary


def test_json_log_formatter_includes_operational_fields() -> None:
    formatter = JsonLogFormatter(environment="production", service_name="exercise-api")
    record = logging.LogRecord(
        name="app.test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=12,
        msg="boom",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-123"

    payload = json.loads(formatter.format(record))

    assert payload["level"] == "ERROR"
    assert payload["logger"] == "app.test"
    assert payload["message"] == "boom"
    assert payload["environment"] == "production"
    assert payload["service"] == "exercise-api"
    assert payload["request_id"] == "req-123"


def test_error_alert_service_posts_webhook_payload(monkeypatch) -> None:
    calls = []

    def fake_post(url: str, json: dict, timeout: int):
        calls.append({"url": url, "json": json, "timeout": timeout})

        class Response:
            def raise_for_status(self) -> None:
                return None

        return Response()

    monkeypatch.setattr("app.core.logging.httpx.post", fake_post)
    service = ErrorAlertService(
        settings=Settings(
            ENVIRONMENT="production",
            ERROR_ALERT_WEBHOOK_URL="https://alerts.example.com/hook",
        )
    )

    service.notify_exception(
        RuntimeError("database unavailable"),
        path="/api/v1/prescriptions",
        method="POST",
        request_id="req-456",
    )

    assert calls == [
        {
            "url": "https://alerts.example.com/hook",
            "json": {
                "environment": "production",
                "service": "AI Exercise Prescription Platform",
                "severity": "error",
                "exception_type": "RuntimeError",
                "message": "database unavailable",
                "path": "/api/v1/prescriptions",
                "method": "POST",
                "request_id": "req-456",
            },
            "timeout": 3,
        }
    ]


def test_startup_runtime_provider_log_is_masked(caplog) -> None:
    runtime_settings = Settings(
        ENVIRONMENT="production",
        LLM_PROVIDER="aliyun",
        LLM_MODEL="qwen-prod",
        DASHSCOPE_API_KEY="dashscope-secret-123456",
        EMBEDDING_PROVIDER="dashscope",
        EMBEDDING_MODEL="text-embedding-v4",
        OCR_ENABLED=True,
    )

    with caplog.at_level(logging.INFO):
        log_runtime_provider_summary(runtime_settings)

    assert "runtime provider status" in caplog.text
    assert "aliyun" in caplog.text
    assert "qwen-prod" in caplog.text
    assert "das...3456" in caplog.text
    assert "dashscope-secret-123456" not in caplog.text


def test_unhandled_exception_returns_uniform_500_and_sends_alert(monkeypatch) -> None:
    app = FastAPI()
    alerts = []

    def fake_notify(self, exc, *, path, method, request_id):
        alerts.append(
            {
                "type": type(exc).__name__,
                "path": path,
                "method": method,
                "request_id": request_id,
            }
        )

    monkeypatch.setattr("app.core.exceptions.ErrorAlertService.notify_exception", fake_notify)
    register_exception_handlers(app)

    @app.get("/explode")
    def explode() -> None:
        raise RuntimeError("sensitive backend details")

    response = TestClient(app, raise_server_exceptions=False).get(
        "/explode",
        headers={"X-Request-ID": "req-789"},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "服务器内部错误", "request_id": "req-789"}
    assert alerts == [
        {
            "type": "RuntimeError",
            "path": "/explode",
            "method": "GET",
            "request_id": "req-789",
        }
    ]
