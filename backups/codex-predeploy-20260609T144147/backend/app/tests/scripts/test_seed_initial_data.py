from sqlalchemy import func, select
from pathlib import Path

from app.models.template import ExerciseAction, KnowledgeDocument, PrescriptionTemplate
from app.models.user import User
import scripts.seed_initial_data as seed_script
import scripts.seed_reference_data as reference_seed


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def scalar_count(db_session, model) -> int:
    return db_session.scalar(select(func.count()).select_from(model))


def test_seed_initial_data_imports_default_content_and_is_idempotent(monkeypatch, db_session):
    monkeypatch.setenv(seed_script.INITIAL_SEED_PASSWORD_ENV, "test-initial-seed-password")
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
    assert all(user.must_change_password for user in db_session.scalars(select(User)).all())


def test_seed_initial_data_main_does_not_print_default_password(monkeypatch, capsys, db_session):
    test_password = "test-initial-seed-password"
    monkeypatch.setenv(seed_script.INITIAL_SEED_PASSWORD_ENV, test_password)
    monkeypatch.setattr(seed_script, "SessionLocal", lambda: db_session)

    seed_script.main()

    output = capsys.readouterr().out
    assert "Default password:" not in output
    assert test_password not in output
    assert "initial seed password is provided by environment" in output


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


def write_launch_reference_files(tmp_path):
    docs_dir = tmp_path / "docs"
    rag_root = tmp_path / "rag_data"
    docs_dir.mkdir()
    (rag_root / "_manifests").mkdir(parents=True)

    (docs_dir / "ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json").write_text(
        """
        [
          {
            "rule_code": "TEST_R2_BP",
            "rule_name": "高血压谨慎规则",
            "risk_level": "R2",
            "severity": "YELLOW",
            "field_path": "risk_screening.has_hypertension",
            "operator": "eq",
            "value": true,
            "user_message": "高血压用户进入专家审核。",
            "contraindications": ["避免憋气"]
          }
        ]
        """,
        encoding="utf-8",
    )
    (docs_dir / "ai_exercise_action_library_v0_1_expert_review_draft.json").write_text(
        """
        [
          {
            "name": "测试快走",
            "category": "有氧",
            "risk_level": "R1",
            "intensity": "低",
            "instructions": "平地快走。"
          }
        ]
        """,
        encoding="utf-8",
    )
    (docs_dir / "ai_exercise_prescription_template_library_v0_1_expert_review_draft.json").write_text(
        """
        [
          {
            "template_code": "TPL_TEST_R1",
            "name": "测试 R1 模板",
            "risk_level": "R1",
            "cluster_tags": ["普通健康维持型"],
            "goal_tags": ["体质提升"],
            "fitt_vp": {
              "frequency": "每周3次",
              "intensity": "低强度",
              "time": "每次20分钟",
              "type": ["测试快走"],
              "volume": "每周60分钟",
              "progression": "每2周调整"
            }
          }
        ]
        """,
        encoding="utf-8",
    )
    (docs_dir / "ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json").write_text(
        """
        {
          "documents": [
            {
              "doc_code": "TEST_CONSENT",
              "title": "测试知情同意",
              "text": "平台不替代医疗诊断。"
            }
          ]
        }
        """,
        encoding="utf-8",
    )
    rag_doc = rag_root / "guides" / "SRC1-001_test.md"
    rag_doc.parent.mkdir()
    rag_doc.write_text("# 测试指南\n高血压用户以低强度起步。", encoding="utf-8")
    (rag_root / "_manifests" / "rag_ingest_allowlist.txt").write_text("guides/SRC1-001_test.md\n", encoding="utf-8")
    (docs_dir / "knowledge_source_catalog_v0_2.json").write_text(
        """
        [
          {
            "source_id": "SRC1-001",
            "title": "测试 RAG 指南",
            "document_type": "指南",
            "version": "2026-test",
            "knowledge_tags": ["R2"],
            "credibility_level": "high"
          }
        ]
        """,
        encoding="utf-8",
    )
    return docs_dir, rag_root


def test_seed_reference_data_imports_launch_content_and_is_idempotent(db_session, tmp_path):
    docs_dir, rag_root = write_launch_reference_files(tmp_path)

    first = reference_seed.seed_reference_data(
        db=db_session,
        docs_dir=docs_dir,
        rag_root=rag_root,
        build_rag_index=False,
        strict=True,
    )

    assert list(first) == ["risk_rules", "actions", "templates", "compliance", "rag_data"]
    assert first["risk_rules"]["errors"] == 0
    assert first["actions"]["errors"] == 0
    assert first["templates"]["errors"] == 0
    assert first["compliance"]["errors"] == 0
    assert first["rag_data"]["errors"] == 0
    assert first["rag_data"]["chunks"] >= 1

    counts = {
        "actions": scalar_count(db_session, ExerciseAction),
        "templates": scalar_count(db_session, PrescriptionTemplate),
        "knowledge": scalar_count(db_session, KnowledgeDocument),
    }

    second = reference_seed.seed_reference_data(
        db=db_session,
        docs_dir=docs_dir,
        rag_root=rag_root,
        build_rag_index=False,
        strict=True,
    )

    assert second["risk_rules"]["errors"] == 0
    assert scalar_count(db_session, ExerciseAction) == counts["actions"]
    assert scalar_count(db_session, PrescriptionTemplate) == counts["templates"]
    assert scalar_count(db_session, KnowledgeDocument) == counts["knowledge"]


def test_seed_reference_data_supports_only_and_skip_rag(db_session, tmp_path):
    docs_dir, rag_root = write_launch_reference_files(tmp_path)

    actions_only = reference_seed.seed_reference_data(
        db=db_session,
        docs_dir=docs_dir,
        rag_root=rag_root,
        only="actions",
        build_rag_index=False,
        strict=True,
    )
    assert list(actions_only) == ["actions"]
    assert scalar_count(db_session, ExerciseAction) == 1
    assert scalar_count(db_session, KnowledgeDocument) == 0

    no_rag = reference_seed.seed_reference_data(
        db=db_session,
        docs_dir=docs_dir,
        rag_root=rag_root,
        skip_rag=True,
        build_rag_index=False,
        strict=True,
    )
    assert "rag_data" not in no_rag


def test_seed_reference_data_cli_parser_supports_launch_options():
    parser = reference_seed.build_arg_parser()
    args = parser.parse_args(["--no-rag-index", "--strict", "--skip-rag", "--only", "templates"])

    assert args.no_rag_index is True
    assert args.strict is True
    assert args.skip_rag is True
    assert args.only == "templates"


def test_seed_reference_data_defaults_to_project_root_environment(monkeypatch, db_session, tmp_path):
    project_root = tmp_path / "workspace"
    project_root.mkdir()
    captured_paths = []

    def fake_import_risk_rules(db, path, **kwargs):
        captured_paths.append(path)
        return {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

    monkeypatch.setenv("PROJECT_ROOT", str(project_root))
    monkeypatch.setattr(reference_seed, "import_risk_rules", fake_import_risk_rules)

    reference_seed.seed_reference_data(db=db_session, only="risk", strict=True)

    assert captured_paths == [
        project_root / "docs" / "ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json"
    ]
