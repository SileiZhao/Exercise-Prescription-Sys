from fastapi.testclient import TestClient

from app.models.cluster import ClusterModel
from app.models.risk import RiskRuleConfig
from app.models.template import ActionReviewStatus, ExerciseAction
from app.tests.helpers import auth_headers_for_role


def risk_rule_payload(code: str = "ORG_ADMIN_GLOBAL_RULE") -> dict:
    return {
        "code": code,
        "name": "机构管理员不得写入的全局规则",
        "severity": "YELLOW",
        "priority": 30,
        "rule_type": "RISK_LEVEL",
        "source_ref": "RBAC 测试",
        "applies_to": ["adult"],
        "review_status": "EXPERT_REVIEW_DRAFT",
        "message": "平台级规则只能由管理员维护。",
        "condition": {"path": "profile.bmi", "op": "gte", "value": 28},
        "contraindications": [],
        "intensity_cap": "低强度",
        "is_active": True,
    }


def action_payload(name: str = "全局动作导入测试") -> dict:
    return {
        "name": name,
        "category": "有氧",
        "risk_level": "R1",
        "intensity": "低",
        "instructions": "平台级动作库导入只能由管理员执行。",
    }


def template_payload(name: str = "全局模板导入测试", status: str = "APPROVED") -> dict:
    return {
        "name": name,
        "risk_level": "R1",
        "cluster_tags": ["慢病稳定型"],
        "goal_tags": ["体能提升"],
        "fitt_vp": {
            "frequency": "每周3次",
            "intensity": "低强度",
            "time": "每次20分钟",
            "type": ["快走"],
            "volume": "每周60分钟",
            "progression": "每2周评估",
        },
        "precautions": ["循序渐进"],
        "contraindications": [],
        "evidence_refs": ["RBAC 测试"],
        "status": status,
        "review_status": "APPROVED",
    }


def test_org_admin_cannot_create_or_update_global_risk_rules(client: TestClient, db_session):
    headers = auth_headers_for_role(client, "rbac-org-admin@example.com", "ORG_ADMIN", organization_id=1)

    create_response = client.post("/api/v1/admin/rules", headers=headers, json=risk_rule_payload())

    assert create_response.status_code == 403

    rule = RiskRuleConfig(
        code="EXISTING_GLOBAL_RULE",
        name="既有全局规则",
        severity="YELLOW",
        priority=50,
        rule_type="RISK_LEVEL",
        source_ref="RBAC 测试",
        applies_to=["adult"],
        review_status="EXPERT_REVIEW_DRAFT",
        message="既有规则",
        condition={"path": "profile.bmi", "op": "gte", "value": 28},
        contraindications=[],
        intensity_cap="低强度",
        is_active=True,
    )
    db_session.add(rule)
    db_session.commit()

    update_response = client.patch(
        f"/api/v1/admin/rules/{rule.id}",
        headers=headers,
        json={"is_active": False, "message": "机构管理员越权修改"},
    )

    assert update_response.status_code == 403


def test_expert_and_org_admin_cannot_write_global_action_library(client: TestClient):
    for role in ("EXPERT", "ORG_ADMIN"):
        headers = auth_headers_for_role(
            client,
            f"rbac-{role.lower()}-action@example.com",
            role,
            organization_id=1 if role == "ORG_ADMIN" else None,
        )

        response = client.post("/api/v1/admin/actions", headers=headers, json=action_payload(f"{role} 越权动作"))

        assert response.status_code == 403


def test_expert_can_review_pending_action_but_org_admin_cannot(client: TestClient, db_session):
    action = ExerciseAction(
        name="待专家审核动作",
        category="有氧",
        risk_level="R1",
        intensity="低",
        status=ActionReviewStatus.PENDING_REVIEW,
    )
    db_session.add(action)
    db_session.commit()

    expert_headers = auth_headers_for_role(client, "rbac-expert-review@example.com", "EXPERT")
    expert_response = client.post(
        f"/api/v1/admin/actions/{action.id}/review",
        headers=expert_headers,
        json={"status": "APPROVED", "comment": "专家审核动作安全边界。"},
    )
    assert expert_response.status_code == 200

    action.status = ActionReviewStatus.PENDING_REVIEW
    action.reviewed_by = None
    action.reviewed_at = None
    db_session.commit()
    org_headers = auth_headers_for_role(client, "rbac-org-review@example.com", "ORG_ADMIN", organization_id=1)
    org_response = client.post(
        f"/api/v1/admin/actions/{action.id}/review",
        headers=org_headers,
        json={"status": "APPROVED", "comment": "机构管理员不得审核全局动作。"},
    )
    assert org_response.status_code == 403


def test_only_admin_can_create_templates_and_creation_forces_draft(client: TestClient):
    expert_headers = auth_headers_for_role(client, "rbac-expert-template@example.com", "EXPERT")
    expert_response = client.post("/api/v1/admin/templates", headers=expert_headers, json=template_payload("专家越权模板"))
    assert expert_response.status_code == 403

    org_headers = auth_headers_for_role(client, "rbac-org-template@example.com", "ORG_ADMIN", organization_id=1)
    org_response = client.post("/api/v1/admin/templates", headers=org_headers, json=template_payload("机构越权模板"))
    assert org_response.status_code == 403

    admin_headers = auth_headers_for_role(client, "rbac-admin-template@example.com", "ADMIN")
    admin_response = client.post(
        "/api/v1/admin/templates",
        headers=admin_headers,
        json=template_payload("管理员导入但不得直接发布", status="APPROVED"),
    )
    assert admin_response.status_code == 200
    assert admin_response.json()["status"] == "DRAFT"
    assert admin_response.json()["review_status"] == "EXPERT_REVIEW_DRAFT"


def test_only_admin_can_mutate_knowledge_library(client: TestClient):
    for role in ("EXPERT", "ORG_ADMIN"):
        headers = auth_headers_for_role(
            client,
            f"rbac-{role.lower()}-knowledge@example.com",
            role,
            organization_id=1 if role == "ORG_ADMIN" else None,
        )
        response = client.post(
            "/api/v1/admin/knowledge/documents",
            headers=headers,
            json={
                "title": f"{role} 越权知识",
                "category": "慢病运动",
                "content": "知识库写入、启停和重建索引属于平台级管理动作。",
                "tags": ["RBAC"],
            },
        )
        assert response.status_code == 403

        reindex_response = client.post("/api/v1/admin/knowledge/reindex", headers=headers)
        assert reindex_response.status_code == 403


def test_researcher_and_org_admin_cannot_train_or_activate_global_cluster_models(client: TestClient, db_session):
    model = ClusterModel(
        name="待启用全局模型",
        algorithm="KMeans",
        n_clusters=2,
        feature_names=["bmi"],
        cluster_profiles=[],
        metrics={"evaluation_passed": 1.0, "silhouette_score": 0.42},
        status="TRAINED",
    )
    db_session.add(model)
    db_session.commit()

    for role in ("RESEARCHER", "ORG_ADMIN"):
        headers = auth_headers_for_role(
            client,
            f"rbac-{role.lower()}-cluster@example.com",
            role,
            organization_id=1 if role == "ORG_ADMIN" else None,
        )
        train_response = client.post(
            "/api/v1/clusters/train",
            headers=headers,
            json={"name": f"{role} 越权训练", "n_clusters": 2, "algorithm": "KMeans"},
        )
        assert train_response.status_code == 403

        status_response = client.patch(
            f"/api/v1/clusters/models/{model.id}/status",
            headers=headers,
            json={"status": "ACTIVE", "reason": "非管理员不得启用全局模型"},
        )
        assert status_response.status_code == 403
