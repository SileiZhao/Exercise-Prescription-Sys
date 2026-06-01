from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus


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


def seed_r2_prescription(client: TestClient, db_session) -> int:
    db_session.add(
        PrescriptionTemplate(
            name="R2审核模板",
            risk_level="R2",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂", "增强心肺"],
            fitt_vp={
                "frequency": "每周3次",
                "intensity": "低强度起步",
                "time": "每次20分钟",
                "type": ["快走", "八段锦"],
                "volume": "每周60分钟",
                "progression": "每2-4周按反馈调整",
            },
            precautions=["监测血压"],
            contraindications=["憋气用力"],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    db_session.commit()
    headers = login(client, "review-user@example.com", "USER")
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "审核用户",
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
        json={"resting_hr": 78, "sbp": 145, "dbp": 92, "pain_score": 1},
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
        json={"has_hypertension": True, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )
    response = client.post("/api/v1/prescriptions/generate", headers=headers)
    assert response.status_code == 200
    return response.json()["id"]


def test_expert_approve_prescription(client: TestClient, db_session):
    prescription_id = seed_r2_prescription(client, db_session)
    expert_headers = login(client, "expert-review@example.com", "EXPERT")

    queue = client.get("/api/v1/expert-reviews", headers=expert_headers)
    assert queue.status_code == 200
    assert any(item["prescription_id"] == prescription_id for item in queue.json())

    response = client.post(
        f"/api/v1/expert-reviews/{prescription_id}/approve",
        headers=expert_headers,
        json={
            "review_comment": "已核对血压风险，降低起始运动量后批准。",
            "edited_prescription": {
                "fitt_vp": {
                    "frequency": "每周3次",
                    "intensity": "低强度",
                    "time": "每次15-20分钟",
                    "type": ["快走", "八段锦"],
                    "volume": "每周45-60分钟",
                    "progression": "2周后根据血压和RPE再调整",
                },
                "precautions": ["运动前后监测血压", "出现头晕胸闷立即停止"],
                "contraindications": ["憋气用力", "大重量抗阻"],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "APPROVED"
    assert body["prescription"]["status"] == "PUBLISHED"
    assert body["prescription"]["version"] == 2
    assert body["prescription"]["fitt_vp"]["time"] == "每次15-20分钟"

    record = db_session.get(PrescriptionRecord, prescription_id)
    assert record.status == "PUBLISHED"
    assert record.expert_review_required is False
    assert db_session.scalar(select(ExpertReview).where(ExpertReview.prescription_id == prescription_id)) is not None
    assert db_session.scalar(select(PrescriptionVersion).where(PrescriptionVersion.prescription_id == prescription_id, PrescriptionVersion.version == 2)) is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPERT_APPROVE_PRESCRIPTION")) is not None


def test_expert_review_detail_includes_traceability_context(client: TestClient, db_session):
    prescription_id = seed_r2_prescription(client, db_session)
    expert_headers = login(client, "expert-detail@example.com", "EXPERT")

    response = client.get(f"/api/v1/expert-reviews/{prescription_id}", headers=expert_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["prescription"]["id"] == prescription_id
    assert body["health_snapshot"]["profile"]["name"] == "审核用户"
    assert body["risk_rules"]
    assert body["template"]["name"] == "R2审核模板"
    assert "evidence_refs" in body
    assert "candidate_actions" in body
