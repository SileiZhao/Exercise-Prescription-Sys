import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.template import PrescriptionTemplate, TemplateStatus
from scripts.import_prescription_templates import import_prescription_templates


def write_payload(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def base_template() -> dict:
    return {
        "template_code": "TPL_R2_HTN",
        "name": "R2高血压谨慎型模板",
        "risk_level": "R2",
        "cluster_tags": ["肥胖代谢风险型", "心肺功能不足型"],
        "goal_tags": ["降血压", "增强心肺"],
        "fitt_vp": {
            "frequency": "每周3次",
            "intensity": "低强度起步",
            "time": "每次20-30分钟",
            "type": ["快走", "八段锦"],
            "volume": "每周90分钟",
            "progression": "每2-4周根据反馈调整",
        },
        "precautions": ["监测血压", "避免憋气"],
        "contraindications": ["高强度间歇", "大重量抗阻"],
        "evidence_refs": ["高血压运动干预指南"],
        "version": "v0.1",
        "expert_review_status": "EXPERT_REVIEW_DRAFT",
        "status": "DRAFT",
    }


def test_import_prescription_templates_creates_fitt_vp_templates(db_session, tmp_path):
    source = tmp_path / "templates.json"
    write_payload(source, json.dumps([base_template()], ensure_ascii=False))

    result = import_prescription_templates(db_session, source, approve_drafts=True, created_by=8)

    templates = db_session.scalars(select(PrescriptionTemplate)).all()
    assert result == {"created": 1, "updated": 0}
    assert len(templates) == 1
    assert templates[0].name == "R2高血压谨慎型模板"
    assert templates[0].status == TemplateStatus.APPROVED
    assert templates[0].template_code == "TPL_R2_HTN"
    assert templates[0].review_status == "EXPERT_APPROVED"
    assert templates[0].approved_by == 8
    assert templates[0].source_version == "v0.1"
    assert templates[0].version == 1
    assert templates[0].fitt_vp["progression"] == "每2-4周根据反馈调整"
    audit = db_session.scalar(select(AuditLog).where(AuditLog.action == "IMPORT_PRESCRIPTION_TEMPLATES"))
    assert audit is not None
    assert audit.actor_id == 8
    assert audit.metadata_json["approve_drafts"] is True
    assert audit.metadata_json["review_status"] == "EXPERT_APPROVED"


def test_import_prescription_templates_updates_existing_and_increments_version(db_session, tmp_path):
    db_session.add(
        PrescriptionTemplate(
            name="R2高血压谨慎型模板",
            risk_level="R2",
            cluster_tags=["旧分型"],
            goal_tags=["降血压"],
            fitt_vp=base_template()["fitt_vp"],
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            status=TemplateStatus.DRAFT,
            version=3,
        )
    )
    db_session.commit()
    updated = base_template()
    updated["status"] = "APPROVED"
    updated["precautions"] = ["运动前后记录血压"]
    source = tmp_path / "templates.json"
    write_payload(source, json.dumps([updated], ensure_ascii=False))

    result = import_prescription_templates(db_session, source)

    templates = db_session.scalars(select(PrescriptionTemplate)).all()
    assert result == {"created": 0, "updated": 1}
    assert len(templates) == 1
    assert templates[0].version == 4
    assert templates[0].status == TemplateStatus.APPROVED
    assert templates[0].cluster_tags == ["肥胖代谢风险型", "心肺功能不足型"]
    assert templates[0].precautions == ["运动前后记录血压"]


def test_import_prescription_templates_rejects_missing_fitt_vp_keys(db_session, tmp_path):
    invalid = base_template()
    del invalid["fitt_vp"]["progression"]
    source = tmp_path / "templates.json"
    write_payload(source, json.dumps([invalid], ensure_ascii=False))

    with pytest.raises(ValueError, match="FITT-VP"):
        import_prescription_templates(db_session, source)


def test_import_prescription_templates_accepts_r3_safety_template_without_fitt_vp(db_session, tmp_path):
    r3_template = {
        "name": "R3红色风险安全提醒模板",
        "risk_level": "R3",
        "cluster_tags": ["红色风险"],
        "goal_tags": ["医学转介"],
        "fitt_vp": None,
        "precautions": ["不生成训练处方"],
        "contraindications": ["训练处方"],
        "evidence_refs": ["PAR-Q+"],
        "template_code": "TPL_R3_SAFETY",
        "expert_review_status": "EXPERT_REVIEW_DRAFT",
        "version": "v0.1",
        "status": "DRAFT",
    }
    source = tmp_path / "templates.json"
    write_payload(source, json.dumps([r3_template], ensure_ascii=False))

    result = import_prescription_templates(db_session, source)

    template = db_session.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.risk_level == "R3"))
    assert result == {"created": 1, "updated": 0}
    assert template is not None
    assert template.fitt_vp is None
    assert template.template_code == "TPL_R3_SAFETY"
    assert template.review_status == "EXPERT_REVIEW_DRAFT"


def test_import_prescription_templates_rejects_r3_template_with_fitt_vp(db_session, tmp_path):
    invalid = base_template()
    invalid["name"] = "R3红色风险安全提醒模板"
    invalid["risk_level"] = "R3"
    source = tmp_path / "templates.json"
    write_payload(source, json.dumps([invalid], ensure_ascii=False))

    with pytest.raises(ValueError, match="R3"):
        import_prescription_templates(db_session, source)
