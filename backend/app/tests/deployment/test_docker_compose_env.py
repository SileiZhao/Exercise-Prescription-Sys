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
        "ENVIRONMENT",
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


def test_frontend_compose_passes_api_base_url_to_build() -> None:
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    frontend_section = compose.split("  frontend:", maxsplit=1)[1].split("volumes:", maxsplit=1)[0]

    assert "args:" in frontend_section
    assert "VITE_API_BASE_URL: ${VITE_API_BASE_URL:-}" in frontend_section


def test_frontend_dockerfile_exposes_vite_api_base_url_during_build() -> None:
    dockerfile = (PROJECT_ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG VITE_API_BASE_URL=" in dockerfile
    assert "ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}" in dockerfile


def test_frontend_dockerfile_uses_lockfile_for_reproducible_installs() -> None:
    dockerfile = (PROJECT_ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")

    assert "COPY package.json package-lock.json ./" in dockerfile
    assert "RUN npm ci --ignore-scripts --no-audit --no-fund" in dockerfile


def test_frontend_nginx_proxies_api_requests_to_backend() -> None:
    nginx_conf = (PROJECT_ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")

    assert "location /api/" in nginx_conf
    assert "proxy_pass http://backend:8000/api/" in nginx_conf


def test_production_compose_overlay_enables_production_provider_defaults() -> None:
    compose = (PROJECT_ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    backend_section = compose.split("  backend:", maxsplit=1)[1].split("  frontend:", maxsplit=1)[0]

    assert "ENVIRONMENT: ${ENVIRONMENT:-production}" in backend_section
    assert "LLM_PROVIDER: ${LLM_PROVIDER:-aliyun}" in backend_section
    assert "EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-dashscope}" in backend_section
    assert "EMBEDDING_MODEL: ${EMBEDDING_MODEL:-text-embedding-v4}" in backend_section
    assert "OCR_ENABLED: ${OCR_ENABLED:-true}" in backend_section
    assert "LOG_FORMAT: ${LOG_FORMAT:-json}" in backend_section
    assert "LLM_PROVIDER: ${LLM_PROVIDER:-mock}" not in backend_section
    assert "LLM_PROVIDER: ${LLM_PROVIDER:-ollama}" not in backend_section
    assert "EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-hash}" not in backend_section
    assert "EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-ollama}" not in backend_section
    assert "OCR_ENABLED: ${OCR_ENABLED:-false}" not in backend_section


def test_production_compose_overlay_runs_startup_guard_against_mock_hash_and_disabled_ocr() -> None:
    compose = (PROJECT_ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    backend_section = compose.split("  backend:", maxsplit=1)[1].split("  frontend:", maxsplit=1)[0]
    guard = (PROJECT_ROOT / "backend" / "scripts" / "verify_production_runtime.py").read_text(encoding="utf-8")

    assert "python scripts/verify_production_runtime.py" in backend_section
    assert "uvicorn app.main:app" in backend_section
    assert "mock LLM provider is not allowed in production" in guard
    assert "hash embedding provider is not allowed in production" in guard
    assert "OCR must be enabled in production" in guard
