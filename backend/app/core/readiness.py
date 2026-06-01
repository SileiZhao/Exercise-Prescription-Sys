from typing import Literal

import httpx
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import Settings, settings
from app.core.database import engine


ComponentState = Literal["ok", "down"]


class ComponentStatus(BaseModel):
    status: ComponentState
    detail: str | None = None


class ReadinessReport(BaseModel):
    status: Literal["ok", "unready"]
    components: dict[str, ComponentStatus]


class ReadinessService:
    def __init__(self, settings: Settings = settings) -> None:
        self.settings = settings

    def run_checks(self) -> ReadinessReport:
        components = {
            "database": self.check_database(),
            "redis": self.check_redis(),
            "qdrant": self.check_qdrant(),
            "minio": self.check_minio(),
            "llm": self.check_llm(),
        }
        status = "ok" if all(component.status == "ok" for component in components.values()) else "unready"
        return ReadinessReport(status=status, components=components)

    def check_database(self) -> ComponentStatus:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return ComponentStatus(status="ok")
        except Exception as exc:  # pragma: no cover - exercised in deployment/runtime
            return ComponentStatus(status="down", detail=str(exc))

    def check_redis(self) -> ComponentStatus:
        try:
            from redis import Redis

            client = Redis.from_url(
                self.settings.REDIS_URL,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            client.ping()
            return ComponentStatus(status="ok")
        except Exception as exc:  # pragma: no cover - exercised in deployment/runtime
            return ComponentStatus(status="down", detail=str(exc))

    def check_qdrant(self) -> ComponentStatus:
        try:
            response = httpx.get(f"{self.settings.QDRANT_URL.rstrip('/')}/collections", timeout=1)
            response.raise_for_status()
            return ComponentStatus(status="ok")
        except Exception as exc:  # pragma: no cover - exercised in deployment/runtime
            return ComponentStatus(status="down", detail=str(exc))

    def check_minio(self) -> ComponentStatus:
        try:
            endpoint = self.settings.MINIO_ENDPOINT
            base_url = endpoint if endpoint.startswith(("http://", "https://")) else f"http://{endpoint}"
            response = httpx.get(f"{base_url.rstrip('/')}/minio/health/ready", timeout=1)
            response.raise_for_status()
            return ComponentStatus(status="ok")
        except Exception as exc:  # pragma: no cover - exercised in deployment/runtime
            return ComponentStatus(status="down", detail=str(exc))

    def check_llm(self) -> ComponentStatus:
        provider = self.settings.LLM_PROVIDER.strip().lower()
        if provider == "mock":
            return ComponentStatus(status="ok", detail="mock provider")

        if provider in {"openai-compatible", "openai", "qwen", "dashscope", "aliyun"}:
            api_key = (
                self.settings.LLM_API_KEY
                or self.settings.DASHSCOPE_API_KEY
                or self.settings.ALIYUN_API_KEY
            )
            if not api_key:
                return ComponentStatus(status="down", detail="missing LLM API key")
            return ComponentStatus(status="ok", detail=f"{provider}:{self.settings.LLM_MODEL}")

        return ComponentStatus(status="down", detail=f"unsupported provider: {self.settings.LLM_PROVIDER}")
