from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    return auth_headers_for_role(client, email, role)


def test_imported_action_defaults_to_pending_review(client: TestClient):
    headers = login(client, "actions-admin@example.com", "ADMIN")

    response = client.post(
        "/api/v1/admin/actions",
        headers=headers,
        json={
            "name": "八段锦",
            "source": "专家动作库",
            "source_exercise_id": "BDJ-01",
            "name_en": "Baduanjin",
            "category": "传统功法",
            "exercise_type": "traditional_qigong",
            "image_url": "https://example.test/baduanjin.png",
            "joint_stress_level": "低",
            "impact_level": "低",
            "requires_equipment": False,
            "is_traditional_exercise": True,
            "suitable_tags": ["老年功能下降型", "初级运动水平"],
            "contraindication_tags": ["急性损伤"],
            "risk_level": "R1",
            "body_parts": ["全身"],
            "intensity": "低",
            "instructions": "以呼吸配合缓慢动作为主。",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PENDING_REVIEW"
    assert body["reviewed_by"] is None
    assert body["source"] == "专家动作库"
    assert body["source_exercise_id"] == "BDJ-01"
    assert body["name_en"] == "Baduanjin"
    assert body["exercise_type"] == "traditional_qigong"
    assert body["image_url"] == "https://example.test/baduanjin.png"
    assert body["joint_stress_level"] == "低"
    assert body["impact_level"] == "低"
    assert body["requires_equipment"] is False
    assert body["is_traditional_exercise"] is True


def test_expert_can_approve_action_and_audit_is_recorded(client: TestClient, db_session):
    headers = login(client, "actions-expert@example.com", "EXPERT")
    db_session.add(
        ExerciseAction(
            name="弹力带划船",
            category="抗阻",
            suitable_tags=["肌力不足型"],
            contraindication_tags=["急性肩痛"],
            risk_level="R1",
            body_parts=["背部", "肩"],
            intensity="低",
            status=ActionReviewStatus.PENDING_REVIEW,
        )
    )
    db_session.commit()
    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "弹力带划船"))

    response = client.post(
        f"/api/v1/admin/actions/{action.id}/review",
        headers=headers,
        json={"status": "APPROVED", "comment": "动作安全边界清晰，可进入模板。"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "APPROVED"
    assert body["reviewed_by"] is not None
    assert body["reviewed_at"] is not None

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "REVIEW_EXERCISE_ACTION",
            AuditLog.resource_type == "ExerciseAction",
            AuditLog.resource_id == str(action.id),
        )
    )
    assert log is not None
    assert log.metadata_json["status"] == "APPROVED"
    assert log.metadata_json["comment"] == "动作安全边界清晰，可进入模板。"


def test_user_cannot_review_action(client: TestClient, db_session):
    headers = login(client, "actions-user@example.com", "USER")
    db_session.add(
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R0",
            status=ActionReviewStatus.PENDING_REVIEW,
        )
    )
    db_session.commit()
    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "快走"))

    response = client.post(
        f"/api/v1/admin/actions/{action.id}/review",
        headers=headers,
        json={"status": "APPROVED"},
    )

    assert response.status_code == 403


def test_admin_can_update_action_and_audit_is_recorded(client: TestClient, db_session):
    headers = login(client, "actions-update-admin@example.com", "ADMIN")
    db_session.add(
        ExerciseAction(
            name="原动作",
            category="有氧",
            risk_level="R1",
            suitable_tags=["旧标签"],
            contraindication_tags=["旧禁忌"],
            intensity="低",
            status=ActionReviewStatus.APPROVED,
        )
    )
    db_session.commit()
    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "原动作"))

    response = client.patch(
        f"/api/v1/admin/actions/{action.id}",
        headers=headers,
        json={
            "name": "更新后动作",
            "category": "抗阻",
            "risk_level": "R2",
            "suitable_tags": ["高血压稳定型"],
            "contraindication_tags": ["胸痛"],
            "intensity": "低—中",
            "instructions": "避免憋气，按专家审核意见执行。",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "更新后动作"
    assert body["category"] == "抗阻"
    assert body["risk_level"] == "R2"
    assert body["suitable_tags"] == ["高血压稳定型"]
    assert body["contraindication_tags"] == ["胸痛"]
    assert body["status"] == "APPROVED"

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "UPDATE_EXERCISE_ACTION",
            AuditLog.resource_type == "ExerciseAction",
            AuditLog.resource_id == str(action.id),
        )
    )
    assert log is not None
    assert log.metadata_json["changes"]["name"]["before"] == "原动作"
    assert log.metadata_json["changes"]["name"]["after"] == "更新后动作"


def test_admin_can_update_template_version_and_audit_is_recorded(client: TestClient, db_session):
    headers = login(client, "templates-update-admin@example.com", "ADMIN")
    template = PrescriptionTemplate(
        name="原模板",
        risk_level="R1",
        cluster_tags=["旧分型"],
        goal_tags=["旧目标"],
        fitt_vp={
            "frequency": "每周3次",
            "intensity": "低强度",
            "time": "每次20分钟",
            "type": ["快走"],
            "volume": "60分钟/周",
            "progression": "每4周调整",
        },
        precautions=["旧注意事项"],
        contraindications=["旧禁忌"],
        evidence_refs=["旧证据"],
        status=TemplateStatus.APPROVED,
        review_status="APPROVED",
        version=2,
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)

    response = client.patch(
        f"/api/v1/admin/templates/{template.id}",
        headers=headers,
        json={
            "name": "更新后模板",
            "risk_level": "R1",
            "cluster_tags": ["代谢改善型"],
            "goal_tags": ["提升完成率"],
            "fitt_vp": {
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走", "弹力带"],
                "volume": "120分钟/周",
                "progression": "每2周调整",
            },
            "precautions": ["监测RPE"],
            "contraindications": ["胸痛时停止"],
            "evidence_refs": ["新证据"],
            "status": "APPROVED",
            "review_status": "APPROVED",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "更新后模板"
    assert body["version"] == 3
    assert body["status"] == "APPROVED"
    assert body["fitt_vp"]["frequency"] == "每周4次"

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "UPDATE_PRESCRIPTION_TEMPLATE",
            AuditLog.resource_type == "PrescriptionTemplate",
            AuditLog.resource_id == str(template.id),
        )
    )
    assert log is not None
    assert log.metadata_json["version_before"] == 2
    assert log.metadata_json["version_after"] == 3
    assert log.metadata_json["changes"]["name"]["before"] == "原模板"
    assert log.metadata_json["changes"]["name"]["after"] == "更新后模板"
