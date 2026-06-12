import json
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.template import KnowledgeChunk, KnowledgeDocument
from scripts.validate_reference_data import validate_reference_data


PROJECT_ROOT = Path(os.environ["PROJECT_ROOT"]).resolve() if os.environ.get("PROJECT_ROOT") else Path(__file__).resolve().parents[4]


def test_validate_reference_data_reports_required_coverage_fields():
    result = validate_reference_data(PROJECT_ROOT)

    assert result["risk_rules_count"] > 0
    assert result["actions_count"] > 0
    assert result["templates_count"] > 0
    assert result["rag_allowlist_count"] > 0
    assert result["missing_files"] == []
    assert result["blocking_errors"] == []


def test_validate_reference_data_cli_outputs_json():
    completed = subprocess.run(
        [sys.executable, "scripts/validate_reference_data.py", "--json"],
        cwd=PROJECT_ROOT / "backend",
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    output = json.loads(completed.stdout)
    assert output["risk_rules_count"] > 0
    assert "missing_files" in output
    assert "blocking_errors" in output


def test_validate_reference_data_defaults_to_project_root_environment(monkeypatch, tmp_path):
    project_root = tmp_path / "workspace"
    project_root.mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(project_root))

    result = validate_reference_data()

    assert result["project_root"] == str(project_root.resolve())


def test_validate_reference_data_relocates_absolute_allowlist_entries(tmp_path):
    project_root = tmp_path / "workspace"
    rag_file = project_root / "rag_data" / "00_core_guidelines" / "guide.pdf"
    rag_file.parent.mkdir(parents=True)
    rag_file.write_text("pdf placeholder", encoding="utf-8")
    allowlist = project_root / "rag_data" / "_manifests" / "rag_ingest_allowlist.txt"
    allowlist.parent.mkdir(parents=True)
    allowlist.write_text(
        "/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data/00_core_guidelines/guide.pdf\n",
        encoding="utf-8",
    )

    result = validate_reference_data(project_root, strict=False)

    assert result["rag_allowlist_count"] == 1
    assert not [error for error in result["blocking_errors"] if error.startswith("rag_allowlist")]


def test_validate_reference_data_rejects_absolute_rag_allowlist_paths(tmp_path):
    rag_root = tmp_path / "rag_data"
    manifest = rag_root / "_manifests"
    manifest.mkdir(parents=True)
    (manifest / "rag_ingest_allowlist.txt").write_text(
        "/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data/demo.pdf\n",
        encoding="utf-8",
    )

    result = validate_reference_data(
        docs_dir=tmp_path / "docs",
        rag_root=rag_root,
        strict=True,
    )

    assert result["absolute_allowlist_paths"]
    assert any("allowlist" in item for item in result["blocking_errors"])


def test_validate_reference_data_strict_detects_active_unindexed_knowledge_documents(tmp_path):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'knowledge.db'}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    with SessionLocal() as session:
        document = KnowledgeDocument(
            title="ACTIVE 但未索引资料",
            category="RAG",
            status="ACTIVE",
            skipped_reason=None,
        )
        session.add(document)
        session.flush()
        session.add(KnowledgeChunk(document_id=document.id, chunk_index=0, content="未索引切片", tags=[]))
        session.commit()

    result = validate_reference_data(
        docs_dir=tmp_path / "docs",
        rag_root=tmp_path / "rag_data",
        strict=True,
        database_url=database_url,
    )

    assert any("knowledge_index" in item for item in result["blocking_errors"])


def test_validate_reference_data_validates_ai_generated_bundle(tmp_path):
    docs_dir = tmp_path / "docs"
    rag_root = tmp_path / "rag_data"
    ai_dir = tmp_path / "ai_generated"
    docs_dir.mkdir()
    (rag_root / "_manifests").mkdir(parents=True)
    (rag_root / "_manifests" / "rag_ingest_allowlist.txt").write_text("", encoding="utf-8")
    ai_dir.mkdir()

    (ai_dir / "ai_generated_contraindications.json").write_text(
        json.dumps({"items": [_contra("C_HTN")]}, ensure_ascii=False),
        encoding="utf-8",
    )
    duplicate_actions = [_action("ACT_AER", "快走", "有氧"), _action("ACT_AER", "慢走", "有氧")]
    (ai_dir / "ai_generated_exercise_actions.json").write_text(
        json.dumps({"items": duplicate_actions}, ensure_ascii=False),
        encoding="utf-8",
    )
    (ai_dir / "ai_generated_prescription_templates.json").write_text(
        json.dumps({"items": [_template("TPL_R1", "R1", ["减脂"], ["快走"])]}, ensure_ascii=False),
        encoding="utf-8",
    )
    (ai_dir / "ai_generated_risk_rules.json").write_text(
        json.dumps({"items": [_rule("RULE_R2_HTN", "R2", "YELLOW")]}, ensure_ascii=False),
        encoding="utf-8",
    )

    result = validate_reference_data(
        docs_dir=docs_dir,
        rag_root=rag_root,
        ai_bundle_dir=ai_dir,
        strict=False,
    )

    assert result["ai_generated_reference"]["counts"]["actions"] == 2
    assert any("duplicate action_code" in item for item in result["blocking_errors"])


def _contra(code: str) -> dict:
    return {
        "contraindication_code": code,
        "disease": "高血压",
        "risk_level": "R2",
        "contraindication_type": "relative",
        "forbidden_action_categories": ["高冲击"],
        "stop_signals": ["胸痛"],
        "referral_criteria": ["静息血压达到红色阈值"],
        "rationale": "慢病风险需避免不可控强度。",
        "evidence_refs": ["ACSM screening"],
    }


def _action(code: str, name: str, category: str) -> dict:
    return {
        "action_code": code,
        "name": name,
        "category": category,
        "risk_level": "R1",
        "suitable_tags": ["减脂", "低冲击"],
        "contraindication_tags": ["胸痛"],
        "body_parts": ["全身"],
        "intensity": "低",
        "impact_level": "低",
        "joint_stress_level": "低",
        "requires_equipment": False,
        "instructions": "保持自然呼吸，按RPE监测。",
        "stop_signals": ["胸痛立即停止"],
        "evidence_refs": ["WHO 2020"],
    }


def _template(code: str, risk_level: str, goals: list[str], actions: list[str] | None) -> dict:
    return {
        "template_code": code,
        "name": f"{risk_level}模板",
        "risk_level": risk_level,
        "cluster_tags": ["普通健康维持型"],
        "goal_tags": goals,
        "fitt_vp": None
        if risk_level == "R3"
        else {
            "frequency": "每周3次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": actions,
            "volume": "每周90分钟",
            "progression": "每2-4周调整",
        },
        "precautions": ["监测RPE"],
        "contraindications": ["胸痛"],
        "evidence_refs": ["WHO 2020"],
        "status": "DRAFT",
    }


def _rule(code: str, risk_level: str, severity: str) -> dict:
    return {
        "rule_code": code,
        "rule_name": code,
        "risk_level": risk_level,
        "severity": severity,
        "priority": 10,
        "field_path": "fitness_test.sbp",
        "operator": "gte",
        "value": 140,
        "user_message": "命中规则后进入对应风险流程。",
        "contraindications": ["高强度冲刺"],
        "intensity_cap": "低强度",
        "evidence_source": "专家规则表",
    }
