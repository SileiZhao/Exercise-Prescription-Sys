from pathlib import Path
import os


def resolve_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured)
    for parent in Path(__file__).resolve().parents:
        if (parent / "docker-compose.yml").exists():
            return parent
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = resolve_project_root()


def test_backend_compose_passes_runtime_environment() -> None:
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    backend_section = compose.split("  backend:", maxsplit=1)[1].split("  frontend:", maxsplit=1)[0]

    required_environment_keys = {
        "SECRET_KEY",
        "BACKEND_CORS_ORIGINS",
        "DATABASE_URL",
        "REDIS_URL",
        "QDRANT_URL",
        "QDRANT_COLLECTION",
        "RAG_VECTOR_SEARCH_ENABLED",
        "RAG_EMBEDDING_DIMENSION",
        "MINIO_ENDPOINT",
        "MINIO_ACCESS_KEY",
        "MINIO_SECRET_KEY",
        "MINIO_BUCKET",
        "LLM_PROVIDER",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "DASHSCOPE_API_KEY",
        "ALIYUN_API_KEY",
        "LLM_MODEL",
        "LLM_MULTIMODAL_MODEL",
        "LOG_LEVEL",
        "LOG_FORMAT",
        "ERROR_ALERT_WEBHOOK_URL",
        "PROJECT_ROOT",
    }

    for key in required_environment_keys:
        assert f"      {key}:" in backend_section


def test_backend_compose_uses_application_readiness_healthcheck() -> None:
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    backend_section = compose.split("  backend:", maxsplit=1)[1].split("  frontend:", maxsplit=1)[0]

    assert "healthcheck:" in backend_section
    assert "curl -fsS http://localhost:8000/ready" in backend_section
