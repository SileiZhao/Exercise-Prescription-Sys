from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog


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


def rule_payload(code: str = "CUSTOM_RED_SBP") -> dict:
    return {
        "code": code,
        "name": "自定义收缩压红色风险",
        "severity": "RED",
        "message": "自定义规则命中：收缩压达到红色风险。",
        "condition": {"path": "fitness_test.sbp", "op": "gte", "value": 175},
        "contraindications": ["禁止生成训练方案"],
        "intensity_cap": "不生成训练处方",
        "is_active": True,
    }


def test_admin_can_create_list_and_audit_risk_rule(client: TestClient, db_session):
    headers = login(client, "rules-admin@example.com", "ADMIN")

    response = client.post("/api/v1/admin/rules", headers=headers, json=rule_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "CUSTOM_RED_SBP"
    assert body["version"] == 1
    assert body["is_active"] is True

    list_response = client.get("/api/v1/admin/rules", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()[0]["code"] == "CUSTOM_RED_SBP"

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "CREATE_RISK_RULE",
            AuditLog.resource_type == "RiskRuleConfig",
            AuditLog.resource_id == "CUSTOM_RED_SBP",
        )
    )
    assert log is not None
    assert log.metadata_json["severity"] == "RED"


def test_admin_rule_test_tool_runs_builtin_and_configured_rules(client: TestClient):
    headers = login(client, "rules-test@example.com", "ADMIN")
    client.post("/api/v1/admin/rules", headers=headers, json=rule_payload())

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=headers,
        json={
            "snapshot": {
                "profile": {"bmi": 22},
                "fitness_test": {"sbp": 176, "dbp": 80, "pain_score": 0},
                "risk_screening": {"chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
            }
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] == "R3"
    assert any(rule["code"] == "CUSTOM_RED_SBP" for rule in body["matched_rules"])
    assert body["allow_ai_generation"] is False


def test_user_cannot_manage_admin_rules(client: TestClient):
    headers = login(client, "rules-user@example.com", "USER")

    response = client.post("/api/v1/admin/rules", headers=headers, json=rule_payload("USER_RULE"))

    assert response.status_code == 403
