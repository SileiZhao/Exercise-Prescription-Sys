from fastapi.testclient import TestClient


def auth_headers(client: TestClient, accept_consent: bool = True) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "health@example.com",
            "password": "StrongPass123",
            "full_name": "健康用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "health@example.com", "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    if accept_consent:
        client.post(
            "/api/v1/health-data/consent",
            headers=headers,
            json={
                "consent_version": "2026-v1",
                "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
            },
        )
    return headers


def test_health_data_requires_informed_consent(client: TestClient):
    headers = auth_headers(client, accept_consent=False)

    response = client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "健康用户",
            "sex": "男",
            "birth_date": "1980-01-01",
            "height_cm": 170,
            "weight_kg": 80,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "请先完成知情同意"

    consent_response = client.post(
        "/api/v1/health-data/consent",
        headers=headers,
        json={
            "consent_version": "2026-v1",
            "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
        },
    )
    assert consent_response.status_code == 200
    assert consent_response.json()["is_active"] is True

    current_response = client.get("/api/v1/health-data/consent", headers=headers)
    assert current_response.status_code == 200
    assert current_response.json()["consent_version"] == "2026-v1"

    retry_response = client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "健康用户",
            "sex": "男",
            "birth_date": "1980-01-01",
            "height_cm": 170,
            "weight_kg": 80,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    assert retry_response.status_code == 200


def test_create_profile_calculates_bmi_and_whr(client: TestClient):
    headers = auth_headers(client)

    response = client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "健康用户",
            "sex": "男",
            "birth_date": "1980-01-01",
            "height_cm": 170,
            "weight_kg": 80,
            "waist_cm": 92,
            "hip_cm": 100,
            "occupation_type": "企业职工",
            "sedentary_hours": 8,
            "sleep_hours": 7,
            "exercise_goal": ["减脂", "增强心肺"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["bmi"] == 27.68
    assert body["whr"] == 0.92


def test_health_snapshot_contains_latest_six_category_data(client: TestClient):
    headers = auth_headers(client)

    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "健康用户",
            "sex": "男",
            "birth_date": "1980-01-01",
            "height_cm": 170,
            "weight_kg": 80,
            "waist_cm": 92,
            "hip_cm": 100,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 78, "sbp": 135, "dbp": 86, "pain_score": 2},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 30.5, "skeletal_muscle_kg": 25, "visceral_fat_level": 12},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 6.1, "tc": 5.4, "tg": 1.8, "hdl_c": 0.9, "ldl_c": 3.5},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={
            "has_hypertension": True,
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
        },
    )
    client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "pre_exercise_confirmed": True,
            "exercise_date": "2026-05-28",
            "exercise_type": "快走",
            "frequency_week": 3,
            "duration_min": 30,
            "intensity_level": "低",
            "rpe": 4,
            "completion_rate": 90,
            "discomfort": ["无"],
        },
    )

    response = client.get("/api/v1/health-data/snapshot", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["bmi"] == 27.68
    assert body["fitness_test"]["sbp"] == 135
    assert body["body_composition"]["body_fat_pct"] == 30.5
    assert body["biochemical_index"]["fbg"] == 6.1
    assert body["risk_screening"]["has_hypertension"] is True
    assert body["exercise_feedback"]["completion_rate"] == 90


def test_fitness_test_validates_field_ranges(client: TestClient):
    headers = auth_headers(client)

    response = client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 160, "sbp": 135, "dbp": 86, "pain_score": 2},
    )

    assert response.status_code == 422


def test_exercise_feedback_requires_pre_exercise_confirmation(client: TestClient):
    headers = auth_headers(client)

    missing_response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "exercise_date": "2026-06-01",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 30,
            "intensity_level": "低",
            "rpe": 5,
            "completion_rate": 80,
        },
    )
    assert missing_response.status_code == 422

    unsafe_response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "exercise_date": "2026-06-01",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 30,
            "intensity_level": "低",
            "rpe": 5,
            "completion_rate": 80,
            "pre_exercise_confirmed": False,
        },
    )
    assert unsafe_response.status_code == 422

    confirmed_response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "exercise_date": "2026-06-01",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 30,
            "intensity_level": "低",
            "rpe": 5,
            "completion_rate": 80,
            "pre_exercise_confirmed": True,
        },
    )
    assert confirmed_response.status_code == 200
    assert confirmed_response.json()["pre_exercise_confirmed"] is True
