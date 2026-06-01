from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.cluster import ClusterModel


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "cluster-user@example.com",
            "password": "StrongPass123",
            "full_name": "分型用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "cluster-user@example.com", "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    client.post(
        "/api/v1/health-data/consent",
        headers=headers,
        json={
            "consent_version": "2026-v1",
            "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
        },
    )
    return headers


def login_as(client: TestClient, email: str, role: str) -> dict[str, str]:
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


def test_classify_current_user_keeps_risk_rules_authoritative(client: TestClient, db_session):
    headers = auth_headers(client)
    active_model = ClusterModel(
        name="已启用分型模型",
        algorithm="KMeans",
        n_clusters=2,
        feature_names=["bmi", "sbp"],
        cluster_profiles=[
            {
                "cluster_id": 1,
                "size": 8,
                "center": {"bmi": 30.0, "sbp": 145.0},
                "suggested_labels": ["肥胖代谢风险型", "心肺功能不足型"],
                "explanation": "该类样本主要表现为肥胖代谢风险型、心肺功能不足型。",
            }
        ],
        metrics={"silhouette_score": 0.41},
        status="ACTIVE",
    )
    db_session.add(active_model)
    db_session.commit()
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "分型用户",
            "sex": "男",
            "birth_date": "1978-01-01",
            "height_cm": 170,
            "weight_kg": 86,
            "waist_cm": 99,
            "hip_cm": 102,
            "exercise_goal": ["减脂", "增强心肺"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 86, "sbp": 145, "dbp": 92, "single_leg_stand": 8, "pain_score": 2},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 34, "skeletal_muscle_kg": 23, "visceral_fat_level": 15},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 6.4, "tc": 5.8, "tg": 2.1, "hdl_c": 0.9, "ldl_c": 3.8},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={"has_hypertension": True, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    response = client.post("/api/v1/clusters/classify/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["model_id"] == active_model.id
    assert body["cluster_id"] == 1
    assert "肥胖代谢风险型" in body["rule_labels"]
    assert body["risk_override"] is False
    assert "不覆盖风险规则" in body["profile_summary"]


def test_admin_can_activate_one_cluster_model_and_archive_previous(client: TestClient, db_session):
    headers = login_as(client, "cluster-admin@example.com", "ADMIN")
    first = ClusterModel(
        name="聚类模型 v1",
        algorithm="KMeans",
        n_clusters=2,
        feature_names=["bmi"],
        cluster_profiles=[],
        metrics={"silhouette_score": 0.31},
        status="ACTIVE",
    )
    second = ClusterModel(
        name="聚类模型 v2",
        algorithm="KMeans",
        n_clusters=3,
        feature_names=["bmi"],
        cluster_profiles=[],
        metrics={"silhouette_score": 0.42},
        status="TRAINED",
    )
    db_session.add_all([first, second])
    db_session.commit()

    response = client.patch(
        f"/api/v1/clusters/models/{second.id}/status",
        headers=headers,
        json={"status": "ACTIVE", "reason": "验证指标更好"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == second.id
    assert body["status"] == "ACTIVE"
    db_session.refresh(first)
    db_session.refresh(second)
    assert first.status == "ARCHIVED"
    assert second.status == "ACTIVE"
    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "UPDATE_CLUSTER_MODEL_STATUS",
            AuditLog.resource_type == "ClusterModel",
            AuditLog.resource_id == str(second.id),
        )
    )
    assert log is not None
    assert log.metadata_json["status"] == "ACTIVE"
    assert log.metadata_json["reason"] == "验证指标更好"


def test_user_cannot_update_cluster_model_status(client: TestClient, db_session):
    headers = login_as(client, "cluster-normal-user@example.com", "USER")
    model = ClusterModel(
        name="聚类模型 v1",
        algorithm="KMeans",
        n_clusters=2,
        feature_names=["bmi"],
        cluster_profiles=[],
        metrics={},
        status="TRAINED",
    )
    db_session.add(model)
    db_session.commit()

    response = client.patch(
        f"/api/v1/clusters/models/{model.id}/status",
        headers=headers,
        json={"status": "ACTIVE"},
    )

    assert response.status_code == 403
