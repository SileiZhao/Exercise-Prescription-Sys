from typing import Literal

import httpx
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import Settings, embedding_api_key, embedding_base_url, llm_api_key, settings
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
            "secret_key": self.check_secret_key(),
            "production_config": self.check_production_config(),
            "database": self.check_database(),
            "redis": self.check_redis(),
            "qdrant": self.check_qdrant(),
            "minio": self.check_minio(),
            "llm": self.check_llm(),
            "embedding": self.check_embedding(),
            "ocr": self.check_ocr(),
        }
        status = "ok" if all(component.status == "ok" for component in components.values()) else "unready"
        return ReadinessReport(status=status, components=components)

    def is_production(self) -> bool:
        return self.settings.ENVIRONMENT.strip().lower() == "production"

    def check_secret_key(self) -> ComponentStatus:
        if self.is_production() and self.settings.SECRET_KEY == "change-me-in-production":
            return ComponentStatus(status="down", detail="SECRET_KEY must be changed in production")
        return ComponentStatus(status="ok")

    def check_production_config(self) -> ComponentStatus:
        if not self.is_production():
            return ComponentStatus(status="ok")
        issues: list[str] = []
        if self.settings.RESEARCH_EXPORT_SALT == "change-me-research-export-salt":
            issues.append("RESEARCH_EXPORT_SALT must be changed in production")
        if not self.settings.RAG_VECTOR_SEARCH_ENABLED:
            issues.append("RAG_VECTOR_SEARCH_ENABLED must be true in production")
        if self.settings.MINIO_ACCESS_KEY == "minioadmin" or self.settings.MINIO_SECRET_KEY == "minioadmin":
            issues.append("default MinIO credentials are not allowed in production")
        if issues:
            return ComponentStatus(status="down", detail="; ".join(issues))
        return ComponentStatus(status="ok")

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
        if provider in {"mock", "local-mock"}:
            if self.is_production():
                return ComponentStatus(status="down", detail="mock LLM provider is not allowed in production")
            return ComponentStatus(status="ok", detail="mock provider")

        if provider in {"ollama", "gemma", "local"}:
            if self.is_production():
                return ComponentStatus(
                    status="down",
                    detail=f"{provider} LLM provider is not allowed in production; use aliyun/dashscope",
                )
            model = self.settings.LOCAL_LLM_MODEL or self.settings.LLM_MODEL
            try:
                response = httpx.get(f"{self.settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=1)
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:  # pragma: no cover - exercised in deployment/runtime
                return ComponentStatus(status="down", detail=str(exc))
            models = payload.get("models") or []
            names = {item.get("name") for item in models if isinstance(item, dict)}
            if model not in names:
                return ComponentStatus(status="down", detail=f"missing Ollama model; run `ollama pull {model}`")
            return ComponentStatus(status="ok", detail=f"ollama:{model}")

        if provider in {"openai-compatible", "openai"} and not self.settings.LLM_BASE_URL:
            return ComponentStatus(status="down", detail="missing LLM_BASE_URL")

        if provider in {"openai-compatible", "openai", "qwen", "dashscope", "aliyun"}:
            api_key, _ = llm_api_key(self.settings)
            if not api_key:
                return ComponentStatus(status="down", detail="missing LLM API key")
            return ComponentStatus(
                status="ok",
                detail=f"{provider}:{self.settings.LLM_MODEL}",
            )

        return ComponentStatus(status="down", detail=f"unsupported provider: {self.settings.LLM_PROVIDER}")

    def check_embedding(self) -> ComponentStatus:
        provider = self.settings.EMBEDDING_PROVIDER.strip().lower()
        detail = f"{provider}:{self.settings.EMBEDDING_MODEL}"
        if provider == "hash":
            if self.is_production():
                return ComponentStatus(status="down", detail="hash embedding provider is not allowed in production")
            return ComponentStatus(status="ok", detail=f"hash:{self.settings.RAG_EMBEDDING_DIMENSION}")
        if provider == "ollama":
            if self.is_production():
                return ComponentStatus(
                    status="down",
                    detail="ollama embedding provider is not allowed in production; use aliyun/dashscope",
                )
            return ComponentStatus(status="ok", detail=detail)
        if provider in {"openai-compatible", "openai", "dashscope", "aliyun"}:
            if not embedding_base_url(self.settings):
                return ComponentStatus(status="down", detail="missing EMBEDDING_BASE_URL")
            api_key, _ = embedding_api_key(self.settings)
            if not api_key:
                return ComponentStatus(status="down", detail="missing EMBEDDING_API_KEY")
            return ComponentStatus(status="ok", detail=detail)
        return ComponentStatus(status="down", detail=f"unsupported embedding provider: {self.settings.EMBEDDING_PROVIDER}")

    def check_ocr(self) -> ComponentStatus:
        provider = self.settings.OCR_PROVIDER.strip().lower()
        if not self.settings.OCR_ENABLED:
            if self.is_production():
                return ComponentStatus(status="down", detail="OCR must be enabled in production")
            return ComponentStatus(status="ok", detail=f"{provider}:disabled")
        if provider != "paddleocr":
            return ComponentStatus(status="down", detail=f"unsupported OCR provider: {self.settings.OCR_PROVIDER}")
        try:
            import paddleocr  # noqa: F401
        except ImportError:
            return ComponentStatus(status="down", detail="PaddleOCR is not installed")
        return ComponentStatus(status="ok", detail="paddleocr:enabled")
