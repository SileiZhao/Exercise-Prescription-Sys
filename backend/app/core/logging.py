import logging
import json
from datetime import datetime, timezone
from logging import LogRecord
from typing import Any

import httpx

from app.core.config import Settings, settings


class JsonLogFormatter(logging.Formatter):
    def __init__(self, *, environment: str, service_name: str) -> None:
        super().__init__()
        self.environment = environment
        self.service_name = service_name

    def format(self, record: LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "environment": self.environment,
            "service": self.service_name,
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class ErrorAlertService:
    def __init__(self, settings: Settings = settings) -> None:
        self.settings = settings

    def notify_exception(
        self,
        exc: Exception,
        *,
        path: str,
        method: str,
        request_id: str,
    ) -> None:
        if not self.settings.ERROR_ALERT_WEBHOOK_URL:
            return
        payload = {
            "environment": self.settings.ENVIRONMENT,
            "service": self.settings.PROJECT_NAME,
            "severity": "error",
            "exception_type": type(exc).__name__,
            "message": str(exc),
            "path": path,
            "method": method,
            "request_id": request_id,
        }
        response = httpx.post(self.settings.ERROR_ALERT_WEBHOOK_URL, json=payload, timeout=3)
        response.raise_for_status()


def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    handler = logging.StreamHandler()
    if settings.LOG_FORMAT.strip().lower() == "json":
        handler.setFormatter(
            JsonLogFormatter(
                environment=settings.ENVIRONMENT,
                service_name=settings.PROJECT_NAME,
            )
        )
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s"))

    logging.basicConfig(level=level, handlers=[handler], force=True)
