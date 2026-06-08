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


def test_application_dockerfiles_allow_base_image_overrides() -> None:
    backend_dockerfile = (PROJECT_ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_dockerfile = (PROJECT_ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG PYTHON_BASE_IMAGE=" in backend_dockerfile
    assert "FROM ${PYTHON_BASE_IMAGE} AS runtime" in backend_dockerfile

    assert "ARG NODE_BASE_IMAGE=" in frontend_dockerfile
    assert "ARG NGINX_BASE_IMAGE=" in frontend_dockerfile
    assert "FROM ${NODE_BASE_IMAGE} AS build" in frontend_dockerfile
    assert "FROM ${NGINX_BASE_IMAGE} AS runtime" in frontend_dockerfile
    assert frontend_dockerfile.index("ARG NGINX_BASE_IMAGE=") < frontend_dockerfile.index("FROM ${NODE_BASE_IMAGE}")


def test_compose_allows_registry_mirror_image_overrides() -> None:
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    for key in [
        "POSTGRES_IMAGE",
        "REDIS_IMAGE",
        "QDRANT_IMAGE",
        "MINIO_IMAGE",
        "PYTHON_BASE_IMAGE",
        "NODE_BASE_IMAGE",
        "NGINX_BASE_IMAGE",
    ]:
        assert f"${{{key}:-" in compose


def test_qdrant_client_version_is_pinned_to_server_compatibility() -> None:
    pyproject = (PROJECT_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "qdrant/qdrant:v1.12.1" in compose
    assert '"qdrant-client>=1.11.3,<1.14"' in pyproject


def test_paddleocr_runtime_includes_paddlepaddle_engine() -> None:
    pyproject = (PROJECT_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert '"paddleocr>=2.8.1"' in pyproject
    assert '"paddlepaddle>=3.0.0,<3.1"' in pyproject
    assert '"numpy>=1.24,<2.4"' in pyproject
    assert '"protobuf>=6.33.5,<7.0.0"' in pyproject
    assert "FLAGS_use_mkldnn: ${FLAGS_use_mkldnn:-false}" in compose
