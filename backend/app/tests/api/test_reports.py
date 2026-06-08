from io import BytesIO
from datetime import date, timedelta
from zipfile import ZipFile

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord
from app.models.review import ExpertReview
from app.tests.helpers import auth_headers_for_role


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "report-user@example.com",
            "password": "StrongPass123",
            "full_name": "报告用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "report-user@example.com", "password": "StrongPass123"},
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
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
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


def utf16be_hex(text: str) -> bytes:
    return text.encode("utf-16-be").hex().upper().encode("ascii")


def test_prescription_report_docx_export_contains_required_sections(client: TestClient, db_session):
    headers = auth_headers(client)
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "报告用户",
            "sex": "女",
            "birth_date": "1985-01-01",
            "height_cm": 165,
            "weight_kg": 70,
            "waist_cm": 82,
            "hip_cm": 98,
            "exercise_goal": ["增强心肺"],
            "exercise_habit": "偶尔运动",
            "exercise_experience": "初级",
        },
    )
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        cluster_label="心肺功能不足型",
        goals=["增强心肺"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走", "八段锦"],
            "volume": "每周120分钟",
            "progression": "每2-4周根据反馈调整",
        },
        precautions=["监测RPE"],
        contraindications=["高强度冲刺"],
        reassessment="4周小评估，12周阶段评估",
        evidence_refs=[{"title": "运动处方指南", "chunk_id": 1}],
        llm_payload={
            "risk_rules": [
                {"rule_id": "YELLOW_BP", "message": "血压偏高，进入R2专家审核", "risk_level": "R2"}
            ]
        },
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.flush()
    db_session.add(
        ExpertReview(
            prescription_id=prescription.id,
            user_id=1,
            expert_id=None,
            status="APPROVED",
            review_comment="专家已审核通过。",
            edited_prescription={},
            action="APPROVE",
        )
    )
    db_session.commit()

    response = client.get(f"/api/v1/reports/prescriptions/{prescription.id}.docx", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    with ZipFile(BytesIO(response.content)) as docx:
        document_xml = docx.read("word/document.xml").decode("utf-8")

    for expected in [
        "个性化运动处方报告",
        "用户摘要",
        "报告用户",
        "风险等级",
        "R1",
        "命中风险规则",
        "血压偏高，进入R2专家审核",
        "分型",
        "心肺功能不足型",
        "FITT-VP",
        "每周4次",
        "快走、八段锦",
        "禁忌",
        "高强度冲刺",
        "复测周期",
        "4周小评估，12周阶段评估",
        "专家审核",
        "专家已审核通过。",
        "免责声明",
    ]:
        assert expected in document_xml
    audit_log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "EXPORT_PRESCRIPTION_REPORT",
            AuditLog.resource_type == "PrescriptionRecord",
            AuditLog.resource_id == str(prescription.id),
        )
    )
    assert audit_log is not None
    assert audit_log.actor_id == 1
    assert audit_log.metadata_json["format"] == "docx"
    assert audit_log.metadata_json["risk_level"] == "R1"


def test_prescription_report_pdf_export_contains_required_sections(client: TestClient, db_session):
    headers = auth_headers(client)
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R2",
        cluster_label="肥胖代谢风险型",
        goals=["降血压"],
        fitt_vp={
            "frequency": "每周3次",
            "intensity": "低强度",
            "time": "每次20分钟",
            "type": ["快走"],
            "volume": "每周60分钟",
            "progression": "专家审核后调整",
        },
        precautions=["运动前后记录血压"],
        contraindications=["憋气发力"],
        reassessment="2周复核",
        evidence_refs=[{"title": "R2高血压运动干预原则", "chunk_id": 2}],
        llm_payload={"risk_rules": [{"rule_id": "R2_HTN", "message": "稳定高血压必须专家审核"}]},
        status="PENDING_REVIEW",
        expert_review_required=True,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()

    response = client.get(f"/api/v1/reports/prescriptions/{prescription.id}.pdf", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")
    assert "个性化运动处方报告".encode("utf-8") in response.content
    assert "稳定高血压必须专家审核".encode("utf-8") in response.content
    assert b"/Subtype /Type0" in response.content
    assert b"/BaseFont /STSong-Light" in response.content
    assert utf16be_hex("个性化运动处方报告") in response.content
    audit_log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "EXPORT_PRESCRIPTION_REPORT",
            AuditLog.resource_type == "PrescriptionRecord",
            AuditLog.resource_id == str(prescription.id),
        )
    )
    assert audit_log is not None
    assert audit_log.actor_id == 1
    assert audit_log.metadata_json["format"] == "pdf"
    assert audit_log.metadata_json["status"] == "PENDING_REVIEW"


def test_phase_assessment_report_docx_export_contains_feedback_summary(client: TestClient, db_session):
    headers = auth_headers(client)
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        cluster_label="久坐低体能型",
        goals=["改善心肺"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走"],
            "volume": "每周120分钟",
            "progression": "每2-4周根据反馈调整",
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
    db_session.flush()
    today = date.today()
    for exercise_date, rpe, completion_rate, discomfort, pain_score_after in [
        (today - timedelta(days=21), 8, 70, ["疼痛"], 5),
        (today - timedelta(days=14), 9, 65, [], 4),
        (today - timedelta(days=7), 7, 80, [], 3),
    ]:
        db_session.add(
            ExerciseFeedback(
                user_id=1,
                prescription_id=prescription.id,
                exercise_date=exercise_date,
                exercise_type="快走",
                frequency_week=1,
                duration_min=30,
                intensity_level="中",
                rpe=rpe,
                completion_rate=completion_rate,
                discomfort=discomfort,
                pain_score_after=pain_score_after,
            )
        )
    db_session.commit()

    response = client.get("/api/v1/reports/phase-assessment.docx?weeks=4", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    with ZipFile(BytesIO(response.content)) as docx:
        document_xml = docx.read("word/document.xml").decode("utf-8")

    for expected in [
        "阶段评估报告",
        "近4周共记录3次运动反馈",
        "平均完成率：71.67%",
        "平均RPE：8.0",
        "疼痛事件：2次",
        "不适事件：1次",
        "评估结论：REVIEW_REQUIRED",
        "疼痛或RPE偏高，进入专家复核",
        "免责声明",
    ]:
        assert expected in document_xml
    audit_log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "EXPORT_PHASE_ASSESSMENT_REPORT",
            AuditLog.resource_type == "PhaseAssessment",
        )
    )
    assert audit_log is not None
    assert audit_log.actor_id == 1
    assert audit_log.metadata_json["format"] == "docx"
    assert audit_log.metadata_json["weeks"] == 4


def test_phase_assessment_pdf_export_contains_feedback_summary(client: TestClient, db_session):
    headers = auth_headers(client)
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        cluster_label="久坐低体能型",
        goals=["改善心肺"],
        fitt_vp={"frequency": "每周4次", "intensity": "低", "time": "30分钟", "type": ["快走"], "volume": "120分钟", "progression": "逐步调整"},
        precautions=[],
        contraindications=[],
        reassessment="4周小评估",
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(prescription)
    db_session.flush()
    for day_offset in [14, 7, 0]:
        db_session.add(
            ExerciseFeedback(
                user_id=1,
                prescription_id=prescription.id,
                exercise_date=date.today(),
                exercise_type="快走",
                frequency_week=1,
                duration_min=30 + day_offset,
                intensity_level="低",
                rpe=5,
                completion_rate=90,
                discomfort=[],
                pain_score_after=1,
            )
        )
    db_session.commit()

    response = client.get("/api/v1/reports/phase-assessment.pdf?weeks=4", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")
    assert "阶段评估报告".encode("utf-8") in response.content
    assert "完成率高且无明显不适".encode("utf-8") in response.content
    assert b"/Subtype /Type0" in response.content
    assert b"/BaseFont /STSong-Light" in response.content
    assert utf16be_hex("阶段评估报告") in response.content
    audit_log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "EXPORT_PHASE_ASSESSMENT_REPORT",
            AuditLog.resource_type == "PhaseAssessment",
        )
    )
    assert audit_log is not None
    assert audit_log.actor_id == 1
    assert audit_log.metadata_json["format"] == "pdf"
    assert audit_log.metadata_json["feedback_count"] == 3


def test_user_can_list_own_report_export_records(client: TestClient, db_session):
    headers = auth_headers(client)
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        cluster_label="久坐低体能型",
        goals=["改善心肺"],
        fitt_vp={"frequency": "每周4次", "intensity": "低", "time": "30分钟", "type": ["快走"], "volume": "120分钟", "progression": "逐步调整"},
        precautions=[],
        contraindications=[],
        reassessment="4周小评估",
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=2,
    )
    db_session.add(prescription)
    db_session.commit()

    client.get(f"/api/v1/reports/prescriptions/{prescription.id}.pdf", headers=headers)
    client.get(f"/api/v1/reports/prescriptions/{prescription.id}.docx", headers=headers)

    response = client.get("/api/v1/reports/exports", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert [item["format"] for item in body["items"]] == ["docx", "pdf"]
    assert body["items"][0]["report_type"] == "PRESCRIPTION"
    assert body["items"][0]["prescription_id"] == prescription.id
    assert body["items"][0]["filename"] == f"prescription-{prescription.id}-v2.docx"


def test_admin_can_list_all_report_export_records(client: TestClient, db_session):
    user_headers = auth_headers(client)
    admin_headers = login_as(client, "report-admin@example.com", "ADMIN")
    prescription = PrescriptionRecord(
        user_id=1,
        risk_level="R2",
        cluster_label="高血压谨慎型",
        goals=["改善血压"],
        fitt_vp={"frequency": "每周3次", "intensity": "低", "time": "20分钟", "type": ["八段锦"], "volume": "60分钟", "progression": "专家审核后调整"},
        precautions=["监测血压"],
        contraindications=["憋气发力"],
        reassessment="2周复核",
        evidence_refs=[],
        llm_payload={},
        status="PENDING_REVIEW",
        expert_review_required=True,
        version=1,
    )
    db_session.add(prescription)
    db_session.commit()

    client.get(f"/api/v1/reports/prescriptions/{prescription.id}.pdf", headers=user_headers)

    response = client.get("/api/v1/reports/exports/all", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == 1
    assert body["items"][0]["exported_by"] == 1
    assert body["items"][0]["risk_level"] == "R2"
    assert body["items"][0]["status"] == "PENDING_REVIEW"
