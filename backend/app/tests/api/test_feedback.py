from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.models.prescription import PrescriptionRecord


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "feedback@example.com",
            "password": "StrongPass123",
            "full_name": "反馈用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "feedback@example.com", "password": "StrongPass123"},
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


def test_feedback_adjustment_api_red_alert(client: TestClient, db_session):
    headers = auth_headers(client)
    user_id = 1
    prescription = PrescriptionRecord(
        user_id=user_id,
        risk_level="R1",
        cluster_label="初级运动水平",
        goals=["增强心肺"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走"],
            "volume": "每周120分钟",
            "progression": "每2-4周调整",
        },
        precautions=["监测RPE"],
        contraindications=["高强度冲刺"],
        reassessment="4周小评估，12周阶段评估",
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()
    db_session.refresh(prescription)

    feedback_response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "prescription_id": prescription.id,
            "pre_exercise_confirmed": True,
            "exercise_date": "2026-05-28",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 10,
            "intensity_level": "低",
            "rpe": 6,
            "completion_rate": 30,
            "discomfort": ["胸闷"],
            "pain_score_after": 2,
        },
    )
    assert feedback_response.status_code == 200

    response = client.post(
        f"/api/v1/feedback/{feedback_response.json()['id']}/adjust",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "RED_ALERT"
    assert body["new_prescription_id"] == prescription.id
    db_session.refresh(prescription)
    assert prescription.status == "REFERRED"
    assert prescription.fitt_vp is None


def test_phase_assessment_summarizes_feedback_and_recommends_review(client: TestClient, db_session):
    headers = auth_headers(client)
    user_id = 1
    prescription = PrescriptionRecord(
        user_id=user_id,
        risk_level="R1",
        cluster_label="久坐低体能型",
        goals=["改善心肺"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走"],
            "volume": "每周120分钟",
            "progression": "每2-4周调整",
        },
        precautions=["监测RPE"],
        contraindications=[],
        reassessment="4周小评估，12周阶段评估",
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()
    db_session.refresh(prescription)

    for payload in [
        {
            "exercise_date": (date.today() - timedelta(days=20)).isoformat(),
            "rpe": 8,
            "completion_rate": 70,
            "discomfort": ["疼痛"],
            "pain_score_after": 5,
        },
        {
            "exercise_date": (date.today() - timedelta(days=13)).isoformat(),
            "rpe": 9,
            "completion_rate": 65,
            "discomfort": [],
            "pain_score_after": 4,
        },
        {
            "exercise_date": (date.today() - timedelta(days=6)).isoformat(),
            "rpe": 7,
            "completion_rate": 80,
            "discomfort": [],
            "pain_score_after": 3,
        },
    ]:
        response = client.post(
            "/api/v1/health-data/exercise-feedback",
            headers=headers,
            json={
                "prescription_id": prescription.id,
                "pre_exercise_confirmed": True,
                "exercise_type": "快走",
                "frequency_week": 1,
                "duration_min": 30,
                "intensity_level": "中",
                **payload,
            },
        )
        assert response.status_code == 200

    response = client.get(
        f"/api/v1/feedback/phase-assessment?prescription_id={prescription.id}&weeks=4",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["prescription_id"] == prescription.id
    assert body["feedback_count"] == 3
    assert body["average_completion_rate"] == 71.67
    assert body["average_rpe"] == 8.0
    assert body["pain_events"] == 2
    assert body["discomfort_events"] == 1
    assert body["decision"] == "REVIEW_REQUIRED"
    assert "疼痛或RPE偏高，进入专家复核" in body["recommendations"]
