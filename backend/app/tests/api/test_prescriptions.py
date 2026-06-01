from fastapi.testclient import TestClient

from app.models.template import PrescriptionTemplate, TemplateStatus


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "rx-api@example.com",
            "password": "StrongPass123",
            "full_name": "处方接口用户",
            "role": "USER",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "rx-api@example.com", "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    client.post(
        "/api/v1/health-data/consent",
        headers=headers,
        json={
            "consent_version": "2026-v1",
            "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
        },
    )
    return headers


def test_generate_prescription_api_publishes_low_risk_user(client: TestClient, db_session):
    db_session.add(
        PrescriptionTemplate(
            name="R1接口模板",
            risk_level="R1",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂", "增强心肺"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走", "八段锦"],
                "volume": "每周120分钟",
                "progression": "每2周根据反馈调整",
            },
            precautions=["监测RPE"],
            contraindications=["高强度冲刺"],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    db_session.commit()
    headers = auth_headers(client)
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "处方接口用户",
            "sex": "男",
            "birth_date": "1988-01-01",
            "height_cm": 170,
            "weight_kg": 82,
            "waist_cm": 96,
            "hip_cm": 102,
            "exercise_goal": ["减脂", "增强心肺"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 78, "sbp": 128, "dbp": 82, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 31, "skeletal_muscle_kg": 25, "visceral_fat_level": 12},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 5.8, "tc": 5.0, "tg": 1.5, "hdl_c": 1.1, "ldl_c": 3.0},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PUBLISHED"
    assert body["risk_level"] == "R1"
    assert body["fitt_vp"]["type"] == ["快走", "八段锦"]
