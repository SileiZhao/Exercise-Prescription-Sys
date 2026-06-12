import pytest
from sqlalchemy import select

from app.models.risk import RiskRuleConfig
from app.models.template import ExerciseAction, PrescriptionTemplate
import scripts.seed_reference_data as reference_seed


def test_seed_reference_data_strict_fails_when_rag_skipped(monkeypatch, db_session, tmp_path):
    captured: dict[str, bool] = {}

    def fake_import_rag_data(*args, strict=False, **kwargs):
        captured["strict"] = strict
        return {"created": 0, "updated": 0, "skipped": 1, "errors": 0, "chunks": 0}

    monkeypatch.setattr(reference_seed, "import_rag_data", fake_import_rag_data)

    with pytest.raises(RuntimeError, match="rag_data.skipped=1"):
        reference_seed.seed_reference_data(
            db=db_session,
            docs_dir=tmp_path / "docs",
            rag_root=tmp_path / "rag_data",
            build_rag_index=False,
            strict=True,
            only="rag",
        )

    assert captured["strict"] is True


def test_seed_reference_data_passes_lightweight_rag_profile(monkeypatch, db_session, tmp_path):
    captured: dict[str, object] = {}

    def fake_import_rag_data(*args, strict=False, profile="full", max_chunks_per_document=None, **kwargs):
        captured["strict"] = strict
        captured["profile"] = profile
        captured["max_chunks_per_document"] = max_chunks_per_document
        return {
            "created": 1,
            "updated": 0,
            "skipped": 0,
            "errors": 0,
            "chunks": 2,
            "deferred": 4,
            "profile": profile,
        }

    monkeypatch.setattr(reference_seed, "import_rag_data", fake_import_rag_data)

    result = reference_seed.seed_reference_data(
        db=db_session,
        docs_dir=tmp_path / "docs",
        rag_root=tmp_path / "rag_data",
        build_rag_index=True,
        strict=True,
        only="rag",
        rag_profile="lightweight",
        rag_max_chunks_per_document=80,
    )

    assert captured == {"strict": True, "profile": "lightweight", "max_chunks_per_document": 80}
    assert result["rag_data"]["deferred"] == 4


def test_seed_reference_data_imports_ai_generated_split_files(db_session, tmp_path):
    ai_dir = tmp_path / "ai_generated"
    ai_dir.mkdir()
    _write_json(ai_dir / "ai_generated_contraindications.json", {"items": [_contra("C_HTN")]})
    _write_json(ai_dir / "ai_generated_exercise_actions.json", {"items": [_action("ACT_WALK", "快走", "有氧")]})
    _write_json(
        ai_dir / "ai_generated_prescription_templates.json",
        {"items": [_template("TPL_R1_WEIGHT", "R1", ["减脂"], ["快走"])]},
    )
    _write_json(ai_dir / "ai_generated_risk_rules.json", {"items": [_rule("RULE_R2_HTN", "R2", "YELLOW")]})
    _write_json(
        ai_dir / "ai_generated_reference_manifest.json",
        {"targets": {"contraindications": 1, "actions": 1, "templates": 1, "risk_rules": 1}},
    )

    result = reference_seed.seed_reference_data(
        db=db_session,
        ai_bundle_dir=ai_dir,
        skip_rag=True,
        only=None,
        strict=True,
    )

    assert list(result) == ["ai_generated_reference", "risk_rules", "actions", "templates"]
    assert result["ai_generated_reference"]["blocking_errors"] == []
    assert result["risk_rules"]["errors"] == 0
    assert db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "快走")) is not None
    assert db_session.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.template_code == "TPL_R1_WEIGHT")) is not None
    assert db_session.scalar(select(RiskRuleConfig).where(RiskRuleConfig.code == "RULE_R2_HTN")) is not None


def _write_json(path, payload):
    import json

    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


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
