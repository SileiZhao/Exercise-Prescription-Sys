from sqlalchemy import func, select
from pathlib import Path

from app.models.template import ExerciseAction, KnowledgeDocument, PrescriptionTemplate
from app.models.user import User
import scripts.seed_initial_data as seed_script


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def scalar_count(db_session, model) -> int:
    return db_session.scalar(select(func.count()).select_from(model))


def test_seed_initial_data_imports_default_content_and_is_idempotent(db_session):
    assert hasattr(seed_script, "seed_initial_data")

    first = seed_script.seed_initial_data(db_session)

    assert first["users"]["created"] == 5
    assert first["actions"]["created"] >= 4
    assert first["knowledge"]["created"] >= 3
    assert first["templates"]["created"] >= 3

    action_count = scalar_count(db_session, ExerciseAction)
    knowledge_count = scalar_count(db_session, KnowledgeDocument)
    template_count = scalar_count(db_session, PrescriptionTemplate)
    user_count = scalar_count(db_session, User)
    template_versions = {
        template.name: template.version
        for template in db_session.scalars(select(PrescriptionTemplate)).all()
    }

    second = seed_script.seed_initial_data(db_session)

    assert second["users"]["created"] == 0
    assert scalar_count(db_session, ExerciseAction) == action_count
    assert scalar_count(db_session, KnowledgeDocument) == knowledge_count
    assert scalar_count(db_session, PrescriptionTemplate) == template_count
    assert scalar_count(db_session, User) == user_count
    assert {
        template.name: template.version
        for template in db_session.scalars(select(PrescriptionTemplate)).all()
    } == template_versions

    assert db_session.scalar(
        select(ExerciseAction).where(ExerciseAction.name == "八段锦")
    ) is not None
    assert db_session.scalar(
        select(KnowledgeDocument).where(KnowledgeDocument.title == "R3红色风险安全边界")
    ) is not None
    assert db_session.scalar(
        select(PrescriptionTemplate).where(PrescriptionTemplate.name == "R2高血压谨慎型模板")
    ) is not None


def test_cli_scripts_bootstrap_project_root_for_direct_python_execution():
    for script_name in [
        "seed_initial_data.py",
        "import_exercise_actions.py",
        "import_knowledge.py",
        "import_prescription_templates.py",
        "train_cluster_model.py",
    ]:
        source = (SCRIPTS_DIR / script_name).read_text(encoding="utf-8")
        assert "ensure_project_root_on_path()" in source, script_name
