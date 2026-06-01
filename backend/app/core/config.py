from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Exercise Prescription Platform"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    SECRET_KEY: str = Field(default="change-me-in-production")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    DATABASE_URL: str = "postgresql+psycopg://exercise:exercise@postgres:5432/exercise"
    REDIS_URL: str = "redis://redis:6379/0"

    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_COLLECTION: str = "exercise_prescription_knowledge"
    RAG_VECTOR_SEARCH_ENABLED: bool = True
    RAG_EMBEDDING_DIMENSION: int = 64

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
    LOCAL_LLM_MODEL: str = "gemma"

    OCR_PROVIDER: str = "paddleocr"
    OCR_ENABLED: bool = False

    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "plain"
    ERROR_ALERT_WEBHOOK_URL: str | None = None

    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
