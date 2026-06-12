from fastapi.testclient import TestClient


def auth_headers(client: TestClient, email: str = "risk@example.com") -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": "风险用户",
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


def submit_profile(client: TestClient, headers: dict[str, str], **overrides):
    payload = {
        "name": "风险用户",
        "sex": "男",
        "birth_date": "1988-01-01",
        "height_cm": 170,
        "weight_kg": 65,
        "waist_cm": 78,
        "hip_cm": 92,
        "exercise_goal": ["增强心肺"],
        "exercise_habit": "每周3-5次",
        "exercise_experience": "初级",
    }
    payload.update(overrides)
    response = client.put("/api/v1/health-data/profile", headers=headers, json=payload)
    assert response.status_code == 200


def submit_fitness(client: TestClient, headers: dict[str, str], **overrides):
    payload = {"resting_hr": 72, "sbp": 118, "dbp": 76, "pain_score": 0}
    payload.update(overrides)
    response = client.post("/api/v1/health-data/fitness-tests", headers=headers, json=payload)
    assert response.status_code == 200


def submit_screening(client: TestClient, headers: dict[str, str], **overrides):
    payload = {
        "has_hypertension": False,
        "has_diabetes": False,
        "has_chd": False,
        "has_stroke": False,
        "has_ckd": False,
        "has_respiratory_disease": False,
        "has_joint_pain": False,
        "recent_injury": False,
        "chest_pain": False,
        "syncope": False,
        "abnormal_dyspnea": False,
        "palpitation": False,
        "doctor_restriction": "无",
        "parq_result": "阴性",
        "medication": [],
    }
    payload.update(overrides)
    response = client.post("/api/v1/health-data/risk-screenings", headers=headers, json=payload)
    assert response.status_code == 200


def evaluate(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.get("/api/v1/risk/evaluate", headers=headers)
    assert response.status_code == 200
    return response.json()


def test_risk_r0(client: TestClient):
    headers = auth_headers(client, "r0@example.com")
    submit_profile(client, headers)
    submit_fitness(client, headers)
    submit_screening(client, headers)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R0"
    assert body["allow_auto_publish"] is True
    assert body["requires_expert_review"] is False


def test_risk_r1(client: TestClient):
    headers = auth_headers(client, "r1@example.com")
    submit_profile(client, headers, weight_kg=82, waist_cm=96, exercise_habit="无规律运动")
    submit_fitness(client, headers)
    submit_screening(client, headers)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R1"
    assert body["allow_auto_publish"] is True
    assert "低—中等强度" in body["intensity_cap"]


def test_risk_r2_requires_review(client: TestClient):
    headers = auth_headers(client, "r2@example.com")
    submit_profile(client, headers)
    submit_fitness(client, headers, sbp=146, dbp=92)
    submit_screening(client, headers, has_hypertension=True)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R2"
    assert body["allow_ai_generation"] is True
    assert body["allow_auto_publish"] is False
    assert body["requires_expert_review"] is True


def test_risk_r3_chest_pain(client: TestClient):
    headers = auth_headers(client, "r3-chest@example.com")
    submit_profile(client, headers)
    submit_fitness(client, headers)
    submit_screening(client, headers, chest_pain=True)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R3"
    assert body["allow_ai_generation"] is False
    assert body["allow_auto_publish"] is False
    assert any(rule["code"] == "RED_CHEST_PAIN" for rule in body["matched_rules"])


def test_risk_r3_high_bp(client: TestClient):
    headers = auth_headers(client, "r3-bp@example.com")
    submit_profile(client, headers)
    submit_fitness(client, headers, sbp=182, dbp=105)
    submit_screening(client, headers)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R3"
    assert any(rule["code"] == "RED_SEVERE_BLOOD_PRESSURE" for rule in body["matched_rules"])


def test_risk_r3_pain_score(client: TestClient):
    headers = auth_headers(client, "r3-pain@example.com")
    submit_profile(client, headers)
    submit_fitness(client, headers, pain_score=7)
    submit_screening(client, headers)

    body = evaluate(client, headers)

    assert body["risk_level"] == "R3"
    assert "医学评估" in body["message"]
