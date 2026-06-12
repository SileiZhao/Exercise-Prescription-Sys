from fastapi.testclient import TestClient

from app.models.audit import AuditLog
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    if role != "USER":
        return auth_headers_for_role(client, email, role)
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


def test_admin_can_list_audit_logs(client: TestClient, db_session):
    admin_headers = login(client, "audit-admin@example.com", "ADMIN")
    db_session.add_all(
        [
            AuditLog(
                actor_id=1,
                action="GENERATE_PRESCRIPTION",
                resource_type="PrescriptionRecord",
                resource_id="10",
                metadata_json={"risk_level": "R2", "status": "PENDING_REVIEW"},
            ),
            AuditLog(
                actor_id=1,
                action="FEEDBACK_ADJUST_PRESCRIPTION",
                resource_type="PrescriptionRecord",
                resource_id="10",
                metadata_json={"decision": "REVIEW_REQUIRED"},
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/v1/admin/audit-logs?limit=10&resource_type=PrescriptionRecord",
        headers=admin_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["items"][0]["action"] == "FEEDBACK_ADJUST_PRESCRIPTION"
    assert body["items"][0]["resource_type"] == "PrescriptionRecord"
    assert body["items"][0]["metadata"]["decision"] == "REVIEW_REQUIRED"
    assert body["items"][1]["action"] == "GENERATE_PRESCRIPTION"


def test_user_cannot_list_audit_logs(client: TestClient):
    user_headers = login(client, "audit-user@example.com", "USER")

    response = client.get("/api/v1/admin/audit-logs", headers=user_headers)

    assert response.status_code == 403
