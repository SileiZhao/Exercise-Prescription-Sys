from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.cluster import UserClusterAssignment
from app.models.health_data import ExerciseFeedback, RiskScreening
from app.models.prescription import PrescriptionRecord


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
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    if role == "USER":
        client.post(
            "/api/v1/health-data/consent",
            headers=headers,
            json={
                "consent_version": "2026-v1",
                "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
            },
        )
    return headers


def test_research_export_desensitized(client: TestClient):
    user_headers = login(client, "research-user@example.com", "USER")
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "真实姓名",
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
        headers=user_headers,
        json={"resting_hr": 78, "sbp": 128, "dbp": 82, "pain_score": 1},
    )

    researcher_headers = login(client, "researcher@example.com", "RESEARCHER")
    response = client.get("/api/v1/research/export/users", headers=researcher_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["participant_code"].startswith("P")
    assert row["profile"]["age"] > 0
    assert row["profile"]["bmi"] == 28.37
    assert row["fitness_test"]["sbp"] == 128
    serialized = str(body)
    assert "真实姓名" not in serialized
    assert "research-user@example.com" not in serialized
    assert "full_name" not in serialized
    assert "email" not in serialized
    assert "phone" not in serialized


def test_research_summary_reports_desensitized_distribution_and_effects(client: TestClient, db_session):
    user_headers = login(client, "summary-user@example.com", "USER")
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "统计用户",
            "sex": "女",
            "birth_date": "1990-01-01",
            "height_cm": 165,
            "weight_kg": 72,
            "waist_cm": 86,
            "hip_cm": 98,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=user_headers,
        json={"resting_hr": 76, "sbp": 132, "dbp": 84, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=user_headers,
        json={"has_hypertension": True, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )
    risk = db_session.scalar(select(RiskScreening).where(RiskScreening.user_id == 1))
    risk.risk_level = "R2"
    db_session.add(
        UserClusterAssignment(
            user_id=1,
            rule_labels=["肥胖代谢风险型"],
            cluster_label="肥胖代谢风险型",
            cluster_id=0,
            profile_summary="腹型肥胖，初级运动水平",
            risk_override=False,
        )
    )
    db_session.add(
        PrescriptionRecord(
            user_id=1,
            risk_level="R2",
            cluster_label="肥胖代谢风险型",
            goals=["减脂"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走"],
                "volume": "每周120分钟",
                "progression": "每2周调整",
            },
            status="PENDING_REVIEW",
            expert_review_required=True,
            version=1,
        )
    )
    db_session.add(
        ExerciseFeedback(
            user_id=1,
            exercise_date=date(2026, 5, 30),
            exercise_type="快走",
            frequency_week=4,
            duration_min=30,
            intensity_level="低",
            rpe=12,
            completion_rate=90,
            discomfort=[],
            pain_score_after=1,
        )
    )
    db_session.commit()

    researcher_headers = login(client, "summary-researcher@example.com", "RESEARCHER")
    response = client.get("/api/v1/research/export/summary", headers=researcher_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["risk_distribution"]["R2"] == 1
    assert body["cluster_distribution"]["肥胖代谢风险型"] == 1
    assert body["prescription_status"]["PENDING_REVIEW"] == 1
    assert body["intervention_effects"]["feedback_count"] == 1
    assert body["intervention_effects"]["average_completion_rate"] == 90
    assert body["intervention_effects"]["average_rpe"] == 12


def test_user_cannot_access_research_summary(client: TestClient):
    user_headers = login(client, "summary-denied@example.com", "USER")

    response = client.get("/api/v1/research/export/summary", headers=user_headers)

    assert response.status_code == 403
