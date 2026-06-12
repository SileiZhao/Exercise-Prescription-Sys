from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    return auth_headers_for_role(client, email, role)


def rule_payload(code: str = "CUSTOM_RED_SBP") -> dict:
    return {
        "code": code,
        "name": "自定义收缩压红色风险",
        "severity": "RED",
        "priority": 10,
        "rule_type": "RISK_LEVEL",
        "source_ref": "测试规则表",
        "applies_to": ["adult"],
        "review_status": "EXPERT_REVIEW_DRAFT",
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
    assert body["priority"] == 10
    assert body["rule_type"] == "RISK_LEVEL"
    assert body["source_ref"] == "测试规则表"
    assert body["applies_to"] == ["adult"]
    assert body["review_status"] == "EXPERT_REVIEW_DRAFT"

    list_response = client.get("/api/v1/admin/rules", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()[0]["code"] == "CUSTOM_RED_SBP"
    assert {"priority", "rule_type", "source_ref", "version"}.issubset(list_response.json()[0])

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


def test_admin_rule_test_tool_supports_extended_dsl_operators(client: TestClient):
    headers = login(client, "rules-ops@example.com", "ADMIN")
    rules = [
        ("OP_NEQ", {"path": "risk_screening.parq_result", "op": "neq", "value": "阴性"}),
        ("OP_GT", {"path": "profile.bmi", "op": "gt", "value": 28}),
        ("OP_LT", {"path": "fitness_test.single_leg_stand", "op": "lt", "value": 6}),
        ("OP_LTE", {"path": "fitness_test.dbp", "op": "lte", "value": 90}),
        ("OP_CONTAINS", {"path": "risk_screening.doctor_restriction", "op": "contains", "value": "限制"}),
        ("OP_EXISTS", {"path": "biochemical_index.ldl_c", "op": "exists"}),
    ]
    for code, condition in rules:
        payload = rule_payload(code)
        payload.update({"severity": "YELLOW", "priority": 20, "condition": condition})
        response = client.post("/api/v1/admin/rules", headers=headers, json=payload)
        assert response.status_code == 200

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=headers,
        json={
            "snapshot": {
                "profile": {"bmi": 29},
                "fitness_test": {"single_leg_stand": 4, "dbp": 88},
                "risk_screening": {"parq_result": "阳性", "doctor_restriction": "医生限制大强度运动"},
                "biochemical_index": {"ldl_c": 4.2},
            }
        },
    )

    assert response.status_code == 200
    matched_codes = {rule["code"] for rule in response.json()["matched_rules"]}
    assert {"OP_NEQ", "OP_GT", "OP_LT", "OP_LTE", "OP_CONTAINS", "OP_EXISTS"}.issubset(matched_codes)


def test_user_cannot_manage_admin_rules(client: TestClient):
    headers = login(client, "rules-user@example.com", "USER")

    response = client.post("/api/v1/admin/rules", headers=headers, json=rule_payload("USER_RULE"))

    assert response.status_code == 403
