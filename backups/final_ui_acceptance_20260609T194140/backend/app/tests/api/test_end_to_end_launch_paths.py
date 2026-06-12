from datetime import date, timedelta
from io import BytesIO
from zipfile import ZipFile

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.template import (
    ActionReviewStatus,
    ExerciseAction,
    KnowledgeChunk,
    KnowledgeDocument,
    PrescriptionTemplate,
    TemplateStatus,
)
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str = "USER") -> dict[str, str]:
    if role != "USER":
        return auth_headers_for_role(client, email, role)
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
        consent = client.post(
            "/api/v1/health-data/consent",
            headers=headers,
            json={
                "consent_version": "2026-v1",
                "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
            },
        )
        assert consent.status_code == 200
    return headers


def seed_launch_reference_content(db_session: Session) -> None:
    templates = [
        PrescriptionTemplate(
            name="E2E R0 基础健康维持模板",
            risk_level="R0",
            cluster_tags=["普通健康维持型"],
            goal_tags=["体质提升"],
            fitt_vp={
                "frequency": "每周3次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走", "八段锦"],
                "volume": "每周90分钟",
                "progression": "每2-4周根据反馈调整",
            },
            precautions=["循序渐进"],
            contraindications=["避免突然大强度训练"],
            status=TemplateStatus.APPROVED,
            version=1,
        ),
        PrescriptionTemplate(
            name="E2E R2 高血压谨慎模板",
            risk_level="R2",
            cluster_tags=["肥胖代谢风险型", "心肺功能不足型", "初级运动水平"],
            goal_tags=["减脂", "增强心肺"],
            fitt_vp={
                "frequency": "每周3次",
                "intensity": "低强度起步",
                "time": "每次20分钟",
                "type": ["快走", "八段锦"],
                "volume": "每周60分钟",
                "progression": "每2-4周按血压和RPE反馈调整",
            },
            precautions=["运动前后监测血压"],
            contraindications=["憋气用力", "大重量抗阻"],
            status=TemplateStatus.APPROVED,
            version=1,
        ),
        PrescriptionTemplate(
            name="E2E R1 反馈模板",
            risk_level="R1",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走"],
                "volume": "每周120分钟",
                "progression": "每2-4周根据反馈调整",
            },
            precautions=["监测RPE"],
            contraindications=["高强度冲刺"],
            status=TemplateStatus.APPROVED,
            version=1,
        ),
    ]
    actions = [
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R0/R1/R2",
            suitable_tags=["体质提升", "减脂", "增强心肺", "普通健康维持型", "初级运动水平"],
            intensity="低",
            instructions="保持可交谈强度。",
            status=ActionReviewStatus.APPROVED,
        ),
        ExerciseAction(
            name="八段锦",
            category="传统功法",
            risk_level="R0/R1/R2",
            suitable_tags=["体质提升", "减脂", "心肺功能不足型"],
            intensity="低",
            instructions="动作缓慢，不憋气。",
            status=ActionReviewStatus.APPROVED,
        ),
    ]
    document = KnowledgeDocument(
        title="E2E 高血压运动处方证据",
        category="指南",
        source="E2E",
        source_type="guideline",
        version="2026-test",
        import_batch_id="e2e-launch",
        credibility_level="high",
    )
    db_session.add_all([*templates, *actions, document])
    db_session.flush()
    db_session.add(
        KnowledgeChunk(
            document_id=document.id,
            chunk_index=0,
            content="高血压用户应低强度起步，运动前后监测血压，避免憋气和大重量抗阻。",
            tags=["R2", "高血压", "增强心肺"],
            source_section="高血压运动原则",
        )
    )
    db_session.commit()


def complete_profile(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str,
    weight_kg: float,
    waist_cm: float,
    goals: list[str],
    habit: str,
    fitness: dict,
    body: dict,
    biochemical: dict,
    risk: dict,
) -> None:
    assert client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": name,
            "sex": "男",
            "birth_date": "1988-01-01",
            "height_cm": 170,
            "weight_kg": weight_kg,
            "waist_cm": waist_cm,
            "hip_cm": 96,
            "sedentary_hours": 4,
            "exercise_goal": goals,
            "exercise_habit": habit,
            "exercise_experience": "初级",
        },
    ).status_code == 200
    assert client.post("/api/v1/health-data/fitness-tests", headers=headers, json=fitness).status_code == 200
    assert client.post("/api/v1/health-data/body-compositions", headers=headers, json=body).status_code == 200
    assert client.post("/api/v1/health-data/biochemical-indexes", headers=headers, json=biochemical).status_code == 200
    assert client.post("/api/v1/health-data/risk-screenings", headers=headers, json=risk).status_code == 200


def generate_prescription(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post("/api/v1/prescriptions/generate", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def docx_text(content: bytes) -> str:
    with ZipFile(BytesIO(content)) as docx:
        return docx.read("word/document.xml").decode("utf-8")


def test_r0_user_generates_published_prescription_and_exports_report(client: TestClient, db_session: Session):
    seed_launch_reference_content(db_session)
    headers = login(client, "e2e-r0@example.com")
    complete_profile(
        client,
        headers,
        name="E2E R0 用户",
        weight_kg=66,
        waist_cm=78,
        goals=["体质提升"],
        habit="每周规律运动",
        fitness={"resting_hr": 70, "sbp": 118, "dbp": 76, "single_leg_stand": 30, "pain_score": 0},
        body={"body_fat_pct": 22, "skeletal_muscle_kg": 28, "visceral_fat_level": 8},
        biochemical={"fbg": 5.0, "tc": 4.5, "tg": 1.1, "hdl_c": 1.2, "ldl_c": 2.6},
        risk={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    risk = client.get("/api/v1/risk/evaluate", headers=headers)
    record = generate_prescription(client, headers)
    report = client.get(f"/api/v1/reports/prescriptions/{record['id']}.docx", headers=headers)

    assert risk.status_code == 200
    assert risk.json()["risk_level"] == "R0"
    assert record["risk_level"] == "R0"
    assert record["status"] == "PUBLISHED"
    assert record["expert_review_required"] is False
    assert record["fitt_vp"]["type"] == ["快走", "八段锦"]
    assert report.status_code == 200
    assert "E2E R0 用户" in docx_text(report.content)
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPORT_PRESCRIPTION_REPORT")) is not None


def test_r2_hypertension_user_requires_expert_edit_before_publication(client: TestClient, db_session: Session):
    seed_launch_reference_content(db_session)
    user_headers = login(client, "e2e-r2@example.com")
    complete_profile(
        client,
        user_headers,
        name="E2E R2 用户",
        weight_kg=86,
        waist_cm=96,
        goals=["减脂", "增强心肺"],
        habit="无规律运动",
        fitness={"resting_hr": 86, "sbp": 146, "dbp": 92, "single_leg_stand": 20, "pain_score": 1},
        body={"body_fat_pct": 31, "skeletal_muscle_kg": 26, "visceral_fat_level": 13},
        biochemical={"fbg": 5.9, "tc": 5.2, "tg": 1.6, "hdl_c": 1.1, "ldl_c": 3.0},
        risk={"has_hypertension": True, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    draft = generate_prescription(client, user_headers)
    expert_headers = login(client, "e2e-expert@example.com", "EXPERT")
    queue = client.get("/api/v1/expert-reviews", headers=expert_headers)
    started = client.post(f"/api/v1/expert-reviews/{draft['id']}/start", headers=expert_headers)
    approved = client.post(
        f"/api/v1/expert-reviews/{draft['id']}/approve",
        headers=expert_headers,
        json={
            "review_comment": "已核对高血压风险，降低起始运动量后批准。",
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
    prescriptions = client.get("/api/v1/prescriptions/me", headers=user_headers)

    assert draft["risk_level"] == "R2"
    assert draft["status"] == "PENDING_REVIEW"
    assert draft["expert_review_required"] is True
    assert any(item["prescription_id"] == draft["id"] for item in queue.json())
    assert started.status_code == 200, started.text
    assert approved.status_code == 200, approved.text
    assert approved.json()["prescription"]["status"] == "PUBLISHED"
    assert approved.json()["prescription"]["version"] == 2
    assert prescriptions.status_code == 200
    assert prescriptions.json()[0]["status"] == "PUBLISHED"
    assert db_session.scalar(
        select(PrescriptionVersion).where(
            PrescriptionVersion.prescription_id == draft["id"],
            PrescriptionVersion.change_reason == "EXPERT_APPROVE",
        )
    ) is not None


def test_r3_chest_pain_user_is_referred_without_fitt_vp(client: TestClient, db_session: Session):
    seed_launch_reference_content(db_session)
    headers = login(client, "e2e-r3@example.com")
    complete_profile(
        client,
        headers,
        name="E2E R3 用户",
        weight_kg=70,
        waist_cm=82,
        goals=["体质提升"],
        habit="偶尔运动",
        fitness={"resting_hr": 76, "sbp": 128, "dbp": 82, "single_leg_stand": 20, "pain_score": 1},
        body={"body_fat_pct": 24, "skeletal_muscle_kg": 27, "visceral_fat_level": 9},
        biochemical={"fbg": 5.1, "tc": 4.6, "tg": 1.2, "hdl_c": 1.2, "ldl_c": 2.5},
        risk={"has_hypertension": False, "chest_pain": True, "syncope": False, "abnormal_dyspnea": False},
    )

    record = generate_prescription(client, headers)

    assert record["risk_level"] == "R3"
    assert record["status"] == "REFERRED"
    assert record["fitt_vp"] is None
    assert record["expert_review_required"] is True
    assert "不生成训练处方" in record["safety_notice"]


def test_published_prescription_feedback_adjustment_and_phase_report(client: TestClient, db_session: Session):
    seed_launch_reference_content(db_session)
    headers = login(client, "e2e-feedback@example.com")
    complete_profile(
        client,
        headers,
        name="E2E 反馈用户",
        weight_kg=82,
        waist_cm=94,
        goals=["减脂"],
        habit="无规律运动",
        fitness={"resting_hr": 78, "sbp": 128, "dbp": 82, "single_leg_stand": 22, "pain_score": 1},
        body={"body_fat_pct": 31, "skeletal_muscle_kg": 25, "visceral_fat_level": 12},
        biochemical={"fbg": 5.7, "tc": 5.0, "tg": 1.5, "hdl_c": 1.1, "ldl_c": 3.0},
        risk={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )
    prescription = generate_prescription(client, headers)

    for offset, rpe, completion, pain, discomfort in [
        (20, 8, 70, 5, ["疼痛"]),
        (13, 9, 65, 4, []),
        (6, 8, 80, 4, []),
    ]:
        feedback = client.post(
            "/api/v1/health-data/exercise-feedback",
            headers=headers,
            json={
                "prescription_id": prescription["id"],
                "pre_exercise_confirmed": True,
                "exercise_date": (date.today() - timedelta(days=offset)).isoformat(),
                "exercise_type": "快走",
                "frequency_week": 1,
                "duration_min": 30,
                "intensity_level": "中",
                "rpe": rpe,
                "completion_rate": completion,
                "discomfort": discomfort,
                "pain_score_after": pain,
            },
        )
        assert feedback.status_code == 200

    adjustment = client.post(f"/api/v1/feedback/{feedback.json()['id']}/adjust", headers=headers)
    phase = client.get(
        f"/api/v1/feedback/phase-assessment?prescription_id={prescription['id']}&weeks=4",
        headers=headers,
    )
    report = client.get(
        f"/api/v1/reports/phase-assessment.docx?prescription_id={prescription['id']}&weeks=4",
        headers=headers,
    )

    assert prescription["status"] == "PUBLISHED"
    assert adjustment.status_code == 200
    assert adjustment.json()["action"] == "REVIEW_REQUIRED"
    assert phase.status_code == 200
    assert phase.json()["feedback_count"] == 3
    assert phase.json()["decision"] == "REVIEW_REQUIRED"
    assert report.status_code == 200
    assert "阶段评估报告" in docx_text(report.content)
    refreshed = db_session.get(PrescriptionRecord, prescription["id"])
    assert refreshed.expert_review_required is True
