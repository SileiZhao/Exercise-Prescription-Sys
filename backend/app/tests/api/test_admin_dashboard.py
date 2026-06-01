from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus
from app.models.user import User


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
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def user_id(db_session, email: str) -> int:
    return db_session.scalar(select(User.id).where(User.email == email))


def test_admin_dashboard_summary(client: TestClient, db_session):
    admin_headers = login(client, "dashboard-admin@example.com", "ADMIN")
    login(client, "dashboard-user-a@example.com", "USER")
    login(client, "dashboard-user-b@example.com", "USER")
    user_a = user_id(db_session, "dashboard-user-a@example.com")
    user_b = user_id(db_session, "dashboard-user-b@example.com")

    db_session.add_all(
        [
            PrescriptionRecord(
                user_id=user_a,
                risk_level="R2",
                cluster_label="肥胖代谢风险型",
                goals=["减脂"],
                fitt_vp={
                    "frequency": "每周3次",
                    "intensity": "低强度",
                    "time": "每次20分钟",
                    "type": ["快走"],
                    "volume": "每周60分钟",
                    "progression": "每2周调整",
                },
                precautions=[],
                contraindications=[],
                reassessment="4周复测",
                evidence_refs=[],
                llm_payload={},
                status="PENDING_REVIEW",
                expert_review_required=True,
                version=1,
            ),
            PrescriptionRecord(
                user_id=user_b,
                risk_level="R3",
                cluster_label="心肺功能不足型",
                goals=["安全评估"],
                fitt_vp=None,
                precautions=[],
                contraindications=[],
                reassessment="医学评估后复测",
                evidence_refs=[],
                llm_payload={},
                status="REFERRED",
                expert_review_required=True,
                version=1,
            ),
            PrescriptionTemplate(
                name="看板模板",
                risk_level="R2",
                cluster_tags=["肥胖代谢风险型"],
                goal_tags=["减脂"],
                fitt_vp={
                    "frequency": "每周3次",
                    "intensity": "低强度",
                    "time": "每次20分钟",
                    "type": ["快走"],
                    "volume": "每周60分钟",
                    "progression": "每2周调整",
                },
                precautions=[],
                contraindications=[],
                status=TemplateStatus.APPROVED,
                version=1,
            ),
        ]
    )
    db_session.flush()
    r2_prescription = db_session.scalar(select(PrescriptionRecord).where(PrescriptionRecord.risk_level == "R2"))
    db_session.add_all(
        [
            ExpertReview(
                prescription_id=r2_prescription.id,
                user_id=user_a,
                status="PENDING",
                edited_prescription={},
            ),
            ExerciseFeedback(
                user_id=user_a,
                prescription_id=r2_prescription.id,
                exercise_date=date(2026, 5, 28),
                exercise_type="快走",
                frequency_week=3,
                duration_min=20,
                intensity_level="低",
                rpe=5,
                completion_rate=80,
                discomfort=[],
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/v1/admin/dashboard/summary", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_users"] == 3
    assert body["risk_distribution"]["R2"] == 1
    assert body["risk_distribution"]["R3"] == 1
    assert body["prescription_status"]["PENDING_REVIEW"] == 1
    assert body["prescription_status"]["REFERRED"] == 1
    assert body["review_stats"]["pending"] == 1
    assert body["r2_review_rate"] == 1.0
    assert body["r3_referral_count"] == 1
    assert body["feedback_stats"]["average_completion_rate"] == 80
    assert body["template_usage"]["approved_templates"] == 1
    assert body["cluster_distribution"]["肥胖代谢风险型"] == 1
