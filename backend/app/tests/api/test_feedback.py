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


def test_feedback_creation_rejects_unpublished_and_superseded_prescriptions(client: TestClient, db_session):
    headers = auth_headers(client)
    records = [
        PrescriptionRecord(
            user_id=1,
            risk_level="R2",
            goals=["控压"],
            fitt_vp={"type": ["快走"]},
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            llm_payload={},
            status="PENDING_REVIEW",
            expert_review_required=True,
            version=1,
        ),
        PrescriptionRecord(
            user_id=1,
            risk_level="R3",
            goals=["医学评估"],
            fitt_vp=None,
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            llm_payload={},
            status="REFERRED",
            expert_review_required=True,
            version=2,
        ),
        PrescriptionRecord(
            user_id=1,
            risk_level="R1",
            goals=["增强心肺"],
            fitt_vp={"type": ["快走"]},
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            llm_payload={},
            status="SUPERSEDED",
            expert_review_required=False,
            version=3,
        ),
        PrescriptionRecord(
            user_id=1,
            risk_level="R3",
            goals=["医学评估"],
            fitt_vp={"type": ["快走"], "intensity": "低"},
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            llm_payload={},
            status="PUBLISHED",
            expert_review_required=True,
            version=4,
        ),
        PrescriptionRecord(
            user_id=1,
            risk_level="R1",
            goals=["增强心肺"],
            fitt_vp=None,
            precautions=[],
            contraindications=[],
            evidence_refs=[],
            llm_payload={},
            status="PUBLISHED",
            expert_review_required=False,
            version=5,
        ),
    ]
    db_session.add_all(records)
    db_session.commit()

    for record in records:
        response = client.post(
            "/api/v1/health-data/exercise-feedback",
            headers=headers,
            json={
                "prescription_id": record.id,
                "pre_exercise_confirmed": True,
                "exercise_date": "2026-05-28",
                "exercise_type": "快走",
                "frequency_week": 1,
                "duration_min": 20,
                "intensity_level": "低",
                "rpe": 6,
                "completion_rate": 80,
                "discomfort": [],
            },
        )

        assert response.status_code == 409
        assert (
            "已发布" in response.json()["detail"]
            or "最新有效" in response.json()["detail"]
            or "R3" in response.json()["detail"]
            or "FITT" in response.json()["detail"]
        )


def test_feedback_creation_requires_bound_latest_executable_prescription(client: TestClient, db_session):
    headers = auth_headers(client)
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        goals=["增强心肺"],
        fitt_vp={"type": ["快走"], "intensity": "低"},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()

    response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "pre_exercise_confirmed": True,
            "exercise_date": "2026-05-28",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 20,
            "intensity_level": "低",
            "rpe": 6,
            "completion_rate": 80,
            "discomfort": [],
        },
    )

    assert response.status_code == 409
    assert "处方" in response.json()["detail"]


def test_feedback_creation_rejects_other_users_prescription_with_forbidden(client: TestClient, db_session):
    headers = auth_headers(client)
    other_user_prescription = PrescriptionRecord(
        user_id=999,
        risk_level="R1",
        goals=["增强心肺"],
        fitt_vp={"type": ["快走"], "intensity": "低"},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(other_user_prescription)
    db_session.commit()

    response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "prescription_id": other_user_prescription.id,
            "pre_exercise_confirmed": True,
            "exercise_date": "2026-05-28",
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 20,
            "intensity_level": "低",
            "rpe": 6,
            "completion_rate": 80,
            "discomfort": [],
        },
    )

    assert response.status_code == 403
    assert "不属于当前用户" in response.json()["detail"]


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


def test_phase_assessment_includes_measurement_changes_and_structured_null_reasons(
    client: TestClient, db_session
):
    headers = auth_headers(client)
    user_id = 1

    first_profile = {
        "name": "反馈用户",
        "sex": "男",
        "birth_date": "1980-01-01",
        "height_cm": 170,
        "weight_kg": 86,
        "waist_cm": 98,
        "hip_cm": 104,
        "occupation_type": "企业职工",
        "sedentary_hours": 8,
        "sleep_hours": 7,
        "exercise_goal": ["减脂", "控压"],
        "exercise_habit": "无规律运动",
        "exercise_experience": "初级",
    }
    second_profile = {**first_profile, "weight_kg": 82, "waist_cm": 93}
    assert client.put("/api/v1/health-data/profile", headers=headers, json=first_profile).status_code == 200
    assert client.put("/api/v1/health-data/profile", headers=headers, json=second_profile).status_code == 200

    for payload in [
        {"resting_hr": 76, "sbp": 142, "dbp": 92, "pain_score": 2, "six_mwt": 480},
        {"resting_hr": 70, "sbp": 132, "dbp": 84, "pain_score": 1, "six_mwt": 540},
    ]:
        assert client.post("/api/v1/health-data/fitness-tests", headers=headers, json=payload).status_code == 200

    for payload in [
        {"body_fat_pct": 31.5, "skeletal_muscle_kg": 25.2},
        {"body_fat_pct": 28.0, "skeletal_muscle_kg": 26.1},
    ]:
        assert client.post("/api/v1/health-data/body-compositions", headers=headers, json=payload).status_code == 200

    assert (
        client.post(
            "/api/v1/health-data/biochemical-indexes",
            headers=headers,
            json={"fbg": 6.8, "tc": 5.8, "tg": 2.2, "hdl_c": 1.0, "ldl_c": 3.8},
        ).status_code
        == 200
    )

    prescription = PrescriptionRecord(
        user_id=user_id,
        risk_level="R1",
        cluster_label="代谢改善型",
        goals=["改善代谢"],
        fitt_vp={"type": ["快走"], "intensity": "低"},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()
    db_session.refresh(prescription)

    response = client.post(
        "/api/v1/health-data/exercise-feedback",
        headers=headers,
        json={
            "prescription_id": prescription.id,
            "pre_exercise_confirmed": True,
            "exercise_date": date.today().isoformat(),
            "exercise_type": "快走",
            "frequency_week": 1,
            "duration_min": 30,
            "intensity_level": "低",
            "rpe": 5,
            "completion_rate": 90,
            "discomfort": [],
            "pain_score_after": 1,
        },
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/v1/feedback/phase-assessment?prescription_id={prescription.id}&weeks=4",
        headers=headers,
    )

    assert response.status_code == 200
    changes = response.json()["measurement_changes"]
    assert changes["profile"]["weight_kg"] == {"before": 86.0, "after": 82.0, "delta": -4.0}
    assert changes["profile"]["bmi"]["delta"] == -1.39
    assert changes["profile"]["waist_cm"] == {"before": 98.0, "after": 93.0, "delta": -5.0}
    assert changes["fitness_test"]["sbp"] == {"before": 142, "after": 132, "delta": -10.0}
    assert changes["fitness_test"]["dbp"] == {"before": 92, "after": 84, "delta": -8.0}
    assert changes["body_composition"]["body_fat_pct"] == {"before": 31.5, "after": 28.0, "delta": -3.5}
    assert changes["body_composition"]["skeletal_muscle_kg"] == {
        "before": 25.2,
        "after": 26.1,
        "delta": 0.9,
    }
    assert changes["biochemical_index"]["fbg"]["value"] is None
    assert "BiochemicalIndex 记录不足 2 条" in changes["biochemical_index"]["fbg"]["null_reason"]
