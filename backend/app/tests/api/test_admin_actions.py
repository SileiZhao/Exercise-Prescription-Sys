from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.template import ActionReviewStatus, ExerciseAction


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": email,
            "role": role,
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": "StrongPass123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_imported_action_defaults_to_pending_review(client: TestClient):
    headers = login(client, "actions-admin@example.com", "ADMIN")

    response = client.post(
        "/api/v1/admin/actions",
        headers=headers,
        json={
            "name": "八段锦",
            "category": "传统功法",
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
