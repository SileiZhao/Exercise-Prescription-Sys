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
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def test_backup_and_restore_scripts_cover_all_persistent_stores() -> None:
    backup_script = SCRIPTS_DIR / "backup_data.sh"
    restore_script = SCRIPTS_DIR / "restore_data.sh"

    assert backup_script.exists()
    assert restore_script.exists()
    assert os.access(backup_script, os.X_OK)
    assert os.access(restore_script, os.X_OK)

    backup_source = backup_script.read_text(encoding="utf-8")
    restore_source = restore_script.read_text(encoding="utf-8")

    assert "pg_dump --clean --if-exists --no-owner --no-acl" in backup_source
    assert "redis-cli SAVE" in backup_source
    assert "postgres.sql" in backup_source
    for archive_name in ("redis_data.tgz", "qdrant_data.tgz", "minio_data.tgz"):
        assert archive_name in backup_source
        assert archive_name in restore_source
    assert "sha256sum" in backup_source
    assert "backup_manifest.sha256" in backup_source
    assert "export COMPOSE_PROJECT_NAME" in backup_source

    assert 'CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"' in restore_source
    assert 'CONFIRM_RESTORE=yes' in restore_source
    assert "psql -v ON_ERROR_STOP=1" in restore_source
    assert "docker compose stop redis qdrant minio" in restore_source
    assert "docker compose up -d redis qdrant minio" in restore_source
    assert "docker compose up -d redis qdrant minio backend frontend" not in restore_source
    assert "export COMPOSE_PROJECT_NAME" in restore_source


def test_backup_and_restore_scripts_do_not_source_dotenv() -> None:
    backup_source = (SCRIPTS_DIR / "backup_data.sh").read_text(encoding="utf-8")
    restore_source = (SCRIPTS_DIR / "restore_data.sh").read_text(encoding="utf-8")

    for source in (backup_source, restore_source):
        assert '. ".env"' not in source
        assert "load_dotenv_value" in source


def test_deployment_docs_include_backup_and_restore_runbook() -> None:
    deployment_doc = (PROJECT_ROOT / "docs" / "08_deployment.md").read_text(encoding="utf-8")
    checklist_doc = (PROJECT_ROOT / "docs" / "10_online_checklist.md").read_text(encoding="utf-8")

    assert "scripts/backup_data.sh" in deployment_doc
    assert "scripts/restore_data.sh" in deployment_doc
    assert "CONFIRM_RESTORE=yes" in deployment_doc
    assert "backup_manifest.sha256" in deployment_doc
    assert "执行一次备份恢复演练" in checklist_doc


def test_deployment_docs_include_application_readiness_check() -> None:
    deployment_doc = (PROJECT_ROOT / "docs" / "08_deployment.md").read_text(encoding="utf-8")
    checklist_doc = (PROJECT_ROOT / "docs" / "10_online_checklist.md").read_text(encoding="utf-8")

    assert "curl http://localhost:8000/ready" in deployment_doc
    assert "database、redis、qdrant、minio、llm" in deployment_doc
    assert "`/ready` 返回" in checklist_doc


def test_deployment_docs_include_logging_and_alerting_runbook() -> None:
    env_example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    deployment_doc = (PROJECT_ROOT / "docs" / "08_deployment.md").read_text(encoding="utf-8")
    checklist_doc = (PROJECT_ROOT / "docs" / "10_online_checklist.md").read_text(encoding="utf-8")

    assert "LOG_FORMAT=json" in env_example
    assert "ERROR_ALERT_WEBHOOK_URL=" in env_example
    assert "LOG_FORMAT=json" in deployment_doc
    assert "ERROR_ALERT_WEBHOOK_URL" in deployment_doc
    assert "错误告警 Webhook" in checklist_doc
