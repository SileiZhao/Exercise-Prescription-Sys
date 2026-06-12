from pathlib import Path
import os


def resolve_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured)
    for parent in Path(__file__).resolve().parents:
        if (parent / "frontend" / "vite.config.ts").exists():
            return parent
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = resolve_project_root()


def test_vite_dev_proxy_uses_explicit_loopback_backend() -> None:
    config = (PROJECT_ROOT / "frontend" / "vite.config.ts").read_text(encoding="utf-8")

    assert '"/api": "http://127.0.0.1:8000"' in config
    assert '"/health": "http://127.0.0.1:8000"' in config
