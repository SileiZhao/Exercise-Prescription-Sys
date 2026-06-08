from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.cluster import ClusterModel
from app.models.risk import RiskRuleConfig
from app.services.clustering_service import FeatureBuilder
from app.tests.helpers import auth_headers_for_role


def auth_headers(client: TestClient, email: str = "cluster-user@example.com", full_name: str = "分型用户") -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": full_name,
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": "StrongPass123"},
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
    return auth_headers_for_role(client, email, role)


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


def test_admin_cannot_activate_cluster_model_that_failed_evaluation(client: TestClient, db_session):
    headers = login_as(client, "cluster-admin-failed@example.com", "ADMIN")
    model = ClusterModel(
        name="未达标 DBSCAN 模型",
        algorithm="DBSCAN",
        n_clusters=1,
        feature_names=["bmi"],
        cluster_profiles=[],
        metrics={"evaluation_passed": 0.0, "silhouette_score": 0.1, "noise_rate": 0.8},
        status="TRAINED",
    )
    db_session.add(model)
    db_session.commit()

    response = client.patch(
        f"/api/v1/clusters/models/{model.id}/status",
        headers=headers,
        json={"status": "ACTIVE", "reason": "尝试启用未达标模型"},
    )

    assert response.status_code == 400
    assert "评估未达标" in response.json()["detail"]


def test_train_cluster_model_accepts_gaussian_mixture_algorithm(client: TestClient, db_session):
    headers = login_as(client, "cluster-train-admin@example.com", "ADMIN")

    for index in range(8):
        user_headers = auth_headers(client, email=f"cluster-train-user-{index}@example.com", full_name=f"训练用户{index}")
        client.put(
            "/api/v1/health-data/profile",
            headers=user_headers,
            json={
                "name": f"训练用户{index}",
                "sex": "男",
                "birth_date": "1980-01-01",
                "height_cm": 170,
                "weight_kg": 70 + index,
                "waist_cm": 80 + index,
                "hip_cm": 96,
                "exercise_goal": ["体质提升"],
                "exercise_habit": "每周1-2次",
                "exercise_experience": "初级",
            },
        )

    response = client.post(
        "/api/v1/clusters/train",
        headers=headers,
        json={"name": "GMM 上线模型", "n_clusters": 2, "algorithm": "GaussianMixture"},
    )

    assert response.status_code == 200
    assert response.json()["algorithm"] == "GaussianMixture"
    assert response.json()["model_origin"] == "bootstrap_rule_calibrated"


def test_train_cluster_model_bootstraps_from_confirmed_risk_rules_when_user_samples_missing(
    client: TestClient, db_session
):
    headers = login_as(client, "cluster-bootstrap-admin@example.com", "ADMIN")
    for index, (code, severity, name, condition) in enumerate(
        [
            ("BOOT_METABOLIC", "YELLOW", "BMI 与腰围代谢风险", {"path": "profile.bmi", "op": "gte", "value": 28}),
            ("BOOT_BP", "YELLOW", "血压关注", {"path": "fitness_test.sbp", "op": "gte", "value": 140}),
            ("BOOT_PAIN", "YELLOW", "疼痛功能受限", {"path": "fitness_test.pain_score", "op": "gte", "value": 4}),
            ("BOOT_LOW_FITNESS", "YELLOW", "低体能平衡不足", {"path": "fitness_test.single_leg_stand", "op": "lt", "value": 10}),
        ],
        start=1,
    ):
        db_session.add(
            RiskRuleConfig(
                code=code,
                name=name,
                severity=severity,
                priority=index,
                source_ref="docs/risk_rules/bootstrap",
                review_status="EXPERT_CONFIRMED",
                message=name,
                condition=condition,
                is_active=True,
            )
        )
    db_session.commit()

    response = client.post(
        "/api/v1/clusters/train",
        headers=headers,
        json={"name": "BOOTSTRAP_V1 上线模型", "n_clusters": 4, "algorithm": "KMeans"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_origin"] == "bootstrap_rule_calibrated"
    assert body["metrics"]["evaluation_passed"] in (0.0, 1.0)
    assert body["metrics"]["cluster_stability"] < 0.70
    assert body["metrics"]["evaluation_passed"] == 0.0
    assert body["metrics"]["silhouette_score"] >= 0.25
    assert len(body["cluster_profiles"]) >= 2


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


def test_classify_current_user_uses_active_model_prediction_not_rule_label_matching(client: TestClient, db_session):
    headers = auth_headers(client)
    snapshot = {
        "profile": {
            "age": 46,
            "bmi": 30.0,
            "waist_cm": 99,
            "sedentary_hours": 8,
            "sex": "男",
            "exercise_habit": "无规律运动",
        },
        "fitness_test": {"resting_hr": 82, "sbp": 138, "dbp": 86, "pain_score": 1, "single_leg_stand": 26},
        "body_composition": {"body_fat_pct": 35, "skeletal_muscle_kg": 25, "visceral_fat_level": 15},
        "biochemical_index": {"fbg": 6.6, "tc": 5.5, "tg": 2.0, "hdl_c": 0.9, "ldl_c": 3.4},
    }
    feature_names, vector = FeatureBuilder().build(snapshot)
    active_model = ClusterModel(
        name="持久化预测模型",
        algorithm="KMeans",
        n_clusters=2,
        feature_names=feature_names,
        scaler_params={"mean": [0.0] * len(vector), "scale": [1.0] * len(vector)},
        model_params={"centers": [vector, [value + 100 for value in vector]], "predict_strategy": "nearest_center"},
        cluster_profiles=[
            {
                "cluster_id": 0,
                "size": 20,
                "center": {"bmi": 30.0},
                "suggested_labels": ["血压关注"],
                "explanation": "持久化模型预测为血压关注簇。",
                "core_risks": ["血压或心肺负荷需关注"],
                "exercise_goals": ["稳定血压反应"],
                "fitt_range": {"frequency": "每周3-5次"},
                "contraindications": ["避免憋气用力"],
                "review_recommendation": "R2 需专家复核。",
            },
            {
                "cluster_id": 1,
                "size": 20,
                "center": {"bmi": 30.0},
                "suggested_labels": ["代谢风险", "肥胖代谢风险型"],
                "explanation": "这是规则标签会匹配到的代谢风险簇。",
            },
        ],
        metrics={"evaluation_passed": 1.0, "silhouette_score": 0.4},
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
            "birth_date": "1980-01-01",
            "height_cm": 170,
            "weight_kg": 86.7,
            "waist_cm": 99,
            "hip_cm": 102,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 82, "sbp": 138, "dbp": 86, "single_leg_stand": 26, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 35, "skeletal_muscle_kg": 25, "visceral_fat_level": 15},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 6.6, "tc": 5.5, "tg": 2.0, "hdl_c": 0.9, "ldl_c": 3.4},
    )

    response = client.post("/api/v1/clusters/classify/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["cluster_id"] == 0
    assert body["cluster_label"] == "血压关注"
    assert "持久化模型预测" in body["profile_summary"]
