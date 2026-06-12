import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE_ENV_VAR = "APP_ENV_FILE"
DASHSCOPE_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
_ENV_FILE_SENTINEL = object()


def resolve_project_root(start: Path | None = None) -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()

    path = start or Path(__file__).resolve()
    for parent in path.parents:
        if (parent / "docker-compose.yml").exists() and (parent / "backend").exists():
            return parent
    return Path(__file__).resolve().parents[3]


def resolve_env_file(project_root: Path | None = None) -> Path:
    configured = os.environ.get(ENV_FILE_ENV_VAR)
    if configured:
        configured_path = Path(configured).expanduser()
        if configured_path.is_absolute():
            return configured_path
        return (resolve_project_root() / configured_path).resolve()
    return (project_root or resolve_project_root()) / ".env"


def mask_secret(value: str | None) -> str:
    if not value:
        return "unset"
    stripped = value.strip()
    if len(stripped) <= 8:
        return "set"
    return f"{stripped[:3]}...{stripped[-4:]}"


def has_llm_api_key(config: "Settings") -> bool:
    key, _ = llm_api_key(config)
    return bool(key)


def has_embedding_api_key(config: "Settings") -> bool:
    key, _ = embedding_api_key(config)
    return bool(key)


def llm_api_key(config: "Settings") -> tuple[str | None, str | None]:
    provider = config.LLM_PROVIDER.strip().lower()
    if provider in {"qwen", "dashscope", "aliyun"}:
        if config.DASHSCOPE_API_KEY:
            return config.DASHSCOPE_API_KEY, "DASHSCOPE_API_KEY"
        if config.ALIYUN_API_KEY:
            return config.ALIYUN_API_KEY, "ALIYUN_API_KEY"
        if config.LLM_API_KEY:
            return config.LLM_API_KEY, "LLM_API_KEY"
        return None, None
    if config.LLM_API_KEY:
        return config.LLM_API_KEY, "LLM_API_KEY"
    if config.DASHSCOPE_API_KEY:
        return config.DASHSCOPE_API_KEY, "DASHSCOPE_API_KEY"
    if config.ALIYUN_API_KEY:
        return config.ALIYUN_API_KEY, "ALIYUN_API_KEY"
    return None, None


def embedding_api_key(config: "Settings") -> tuple[str | None, str | None]:
    provider = config.EMBEDDING_PROVIDER.strip().lower()
    if provider in {"dashscope", "aliyun"}:
        if config.EMBEDDING_API_KEY:
            return config.EMBEDDING_API_KEY, "EMBEDDING_API_KEY"
        if config.DASHSCOPE_API_KEY:
            return config.DASHSCOPE_API_KEY, "DASHSCOPE_API_KEY"
        if config.ALIYUN_API_KEY:
            return config.ALIYUN_API_KEY, "ALIYUN_API_KEY"
        return None, None
    return config.EMBEDDING_API_KEY, "EMBEDDING_API_KEY" if config.EMBEDDING_API_KEY else None


def embedding_base_url(config: "Settings") -> str | None:
    provider = config.EMBEDDING_PROVIDER.strip().lower()
    if provider in {"dashscope", "aliyun"}:
        return config.EMBEDDING_BASE_URL or DASHSCOPE_COMPATIBLE_BASE_URL
    return config.EMBEDDING_BASE_URL


def _llm_model(config: "Settings") -> str:
    provider = config.LLM_PROVIDER.strip().lower()
    if provider in {"ollama", "gemma", "local"}:
        return config.LOCAL_LLM_MODEL or config.LLM_MODEL
    return config.LLM_MODEL


def _llm_base_url(config: "Settings") -> str | None:
    provider = config.LLM_PROVIDER.strip().lower()
    if provider in {"qwen", "dashscope", "aliyun"}:
        return config.LLM_BASE_URL or DASHSCOPE_COMPATIBLE_BASE_URL
    if provider in {"ollama", "gemma", "local"}:
        return config.OLLAMA_BASE_URL
    return config.LLM_BASE_URL


def runtime_provider_summary(config: "Settings") -> dict[str, Any]:
    return {
        "environment": config.ENVIRONMENT,
        "env_file": str(resolve_env_file()),
        "llm": {
            "provider": config.LLM_PROVIDER.strip().lower(),
            "model": _llm_model(config),
            "base_url": _llm_base_url(config),
            "configured": has_llm_api_key(config),
        },
        "embedding": {
            "provider": config.EMBEDDING_PROVIDER.strip().lower(),
            "model": config.EMBEDDING_MODEL,
            "base_url": embedding_base_url(config),
            "configured": has_embedding_api_key(config),
        },
        "ocr": {
            "provider": config.OCR_PROVIDER.strip().lower(),
            "enabled": config.OCR_ENABLED,
        },
    }


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Exercise Prescription Platform"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    SECRET_KEY: str = Field(default="change-me-in-production")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    DATABASE_URL: str = "postgresql+psycopg://exercise:exercise@postgres:5432/exercise"
    REDIS_URL: str = "redis://redis:6379/0"

    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_COLLECTION: str = "exercise_prescription_knowledge"
    RAG_VECTOR_SEARCH_ENABLED: bool = True
    RAG_EMBEDDING_DIMENSION: int = 64
    RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH: bool = False
    RAG_INDEX_BATCH_SIZE: int = 64
    EMBEDDING_PROVIDER: str = "hash"
    EMBEDDING_MODEL: str = "nomic-embed-text"
    EMBEDDING_BASE_URL: str | None = None
    EMBEDDING_API_KEY: str | None = None
    EMBEDDING_TIMEOUT_SECONDS: float = 120

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "exercise-platform"

    LLM_PROVIDER: str = "mock"
    LLM_BASE_URL: str | None = None
    LLM_API_KEY: str | None = None
    DASHSCOPE_API_KEY: str | None = None
    ALIYUN_API_KEY: str | None = None
    LLM_MODEL: str = "qwen3.7-max"
    LLM_MULTIMODAL_MODEL: str = "qwen3.6-plus"
    MULTIMODAL_MODEL: str | None = None
    LOCAL_LLM_PROVIDER: str = "ollama"
    LOCAL_LLM_MODEL: str = "gemma3:latest"
    OLLAMA_BASE_URL: str = "http://ollama:11434"

    OCR_PROVIDER: str = "paddleocr"
    OCR_ENABLED: bool = False
    OCR_LANGUAGE: str = "ch"
    OCR_USE_GPU: bool = False
    OCR_MIN_CONFIDENCE: float = 0.5
    OCR_PDF_MAX_PAGES: int = 80

    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "plain"
    ERROR_ALERT_WEBHOOK_URL: str | None = None
    RESEARCH_EXPORT_SALT: str = "change-me-research-export-salt"

    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.2.15:5173",
    ]

    model_config = SettingsConfigDict(env_file_encoding="utf-8", extra="ignore")

    def __init__(self, **values: Any) -> None:
        env_file = values.pop("_env_file", _ENV_FILE_SENTINEL)
        if env_file is _ENV_FILE_SENTINEL:
            env_file = resolve_env_file()
        super().__init__(_env_file=env_file, **values)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
