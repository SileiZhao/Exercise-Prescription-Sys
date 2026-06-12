from pathlib import Path
import os
import re


def resolve_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured)
    for parent in Path(__file__).resolve().parents:
        if (parent / "docker-compose.yml").exists():
            return parent
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = resolve_project_root()
MIGRATIONS_DIR = PROJECT_ROOT / "backend" / "alembic" / "versions"


def migration_files() -> list[Path]:
    return [path for path in MIGRATIONS_DIR.glob("*.py") if not path.name.startswith("._")]


def test_postgres_enums_are_not_created_twice_by_table_columns() -> None:
    migration_sources = {
        migration.name: migration.read_text(encoding="utf-8")
        for migration in migration_files()
    }

    enum_migrations = {
        name: source
        for name, source in migration_sources.items()
        if ".create(op.get_bind(), checkfirst=True)" in source
    }

    assert enum_migrations
    for name, source in enum_migrations.items():
        assert "create_type=False" in source, name
        assert "postgresql.ENUM" in source, name


def test_migration_revision_ids_fit_default_alembic_version_column() -> None:
    for migration in migration_files():
        source = migration.read_text(encoding="utf-8")
        match = re.search(r'^revision: str = "([^"]+)"', source, re.MULTILINE)
        assert match, migration.name
        assert len(match.group(1)) <= 32, migration.name
