import json
from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.cluster import UserClusterAssignment
from app.models.health_data import BiochemicalIndex, BodyComposition, ExerciseFeedback, FitnessTest, RiskScreening, UserProfile
from app.models.prescription import PrescriptionRecord
from app.models.research import ResearchExportRequest
from app.models.user import utcnow
from app.services.research_export_service import ResearchExportService
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str, organization_id: int | None = None) -> dict[str, str]:
    headers = auth_headers_for_role(client, email, role, organization_id=organization_id)
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


def test_admin_direct_research_export_is_desensitized_and_researcher_direct_export_is_forbidden(
    client: TestClient,
    db_session,
):
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
    forbidden = client.get("/api/v1/research/export/users", headers=researcher_headers)
    assert forbidden.status_code == 403

    admin_headers = login(client, "research-admin@example.com", "ADMIN")
    response = client.get("/api/v1/research/export/users", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["participant_code"].startswith("R")
    assert row["participant_code"] != "P000001"
    assert row["profile"]["age"] > 0
    assert row["profile"]["bmi"] == 28.37
    assert row["fitness_test"]["sbp"] == 128
    serialized = str(body)
    assert "真实姓名" not in serialized
    assert "research-user@example.com" not in serialized
    assert "full_name" not in serialized
    assert "email" not in serialized
    assert "phone" not in serialized
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "RESEARCH_EXPORT_PREVIEWED"))
    assert log is not None
    assert log.resource_type == "ResearchExportPreview"
    assert log.metadata_json["row_count"] == 1


def test_research_summary_reports_desensitized_distribution_and_effects(client: TestClient, db_session):
    user_headers = login(client, "summary-user@example.com", "USER", organization_id=1)
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

    researcher_headers = login(client, "summary-researcher@example.com", "RESEARCHER", organization_id=1)
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


def test_research_export_request_approval_and_csv_xlsx_download(client: TestClient, db_session, monkeypatch):
    monkeypatch.setattr(settings, "RESEARCH_EXPORT_SALT", "test-research-salt")
    user_headers = login(client, "download-subject@example.com", "USER", organization_id=1)
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "下载用户",
            "sex": "女",
            "birth_date": "1980-01-01",
            "height_cm": 160,
            "weight_kg": 70,
            "waist_cm": 88,
            "hip_cm": 98,
            "exercise_goal": ["改善血压"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    subject = db_session.scalar(select(UserProfile).where(UserProfile.name == "下载用户"))
    db_session.add_all(
        [
            FitnessTest(
                user_id=subject.user_id,
                resting_hr=80,
                sbp=142,
                dbp=92,
                grip_left=24,
                grip_right=26,
                sit_reach=8,
                single_leg_stand=15,
                pain_score=2,
            ),
            RiskScreening(
                user_id=subject.user_id,
                has_hypertension=True,
                has_diabetes=False,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=False,
                has_joint_pain=False,
                recent_injury=False,
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=False,
                palpitation=False,
                medication=["降压药"],
                risk_level="R2",
                risk_reasons=["血压偏高"],
            ),
            PrescriptionRecord(
                user_id=subject.user_id,
                risk_level="R2",
                cluster_label="血压关注",
                goals=["改善血压"],
                fitt_vp={
                    "frequency": "每周3次",
                    "intensity": "低强度",
                    "time": "每次20分钟",
                    "type": ["快走"],
                    "volume": "每周60分钟",
                    "progression": "2周后复核",
                },
                status="PUBLISHED",
                expert_review_required=True,
                version=1,
            ),
            ExerciseFeedback(
                user_id=subject.user_id,
                exercise_date=date(2026, 6, 1),
                exercise_type="快走",
                frequency_week=3,
                duration_min=20,
                intensity_level="低",
                rpe=13,
                completion_rate=80,
                discomfort=[],
                pain_score_after=1,
            ),
        ]
    )
    db_session.commit()
    researcher_headers = login(client, "download-researcher@example.com", "RESEARCHER", organization_id=1)
    admin_headers = login(client, "download-admin@example.com", "ADMIN")

    created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "csv", "purpose": "阶段研究分析"},
    )

    assert created.status_code == 201
    request_id = created.json()["id"]
    assert created.json()["status"] == "PENDING"
    premature = client.get(f"/api/v1/research/export/requests/{request_id}/download", headers=researcher_headers)
    assert premature.status_code == 403

    approved = client.post(
        f"/api/v1/research/export/requests/{request_id}/approve",
        headers=admin_headers,
        json={"approval_comment": "同意脱敏导出"},
    )

    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"
    csv_response = client.get(f"/api/v1/research/export/requests/{request_id}/download", headers=researcher_headers)
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    text = csv_response.text
    assert "participant_code,age_band,sex,height_cm" in text
    assert "下载用户" not in text
    assert "download-subject@example.com" not in text
    assert "R" in text

    xlsx_created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "xlsx", "purpose": "Excel 汇总"},
    )
    xlsx_id = xlsx_created.json()["id"]
    client.post(
        f"/api/v1/research/export/requests/{xlsx_id}/approve",
        headers=admin_headers,
        json={"approval_comment": "同意 Excel 脱敏导出"},
    )
    xlsx_response = client.get(f"/api/v1/research/export/requests/{xlsx_id}/download", headers=researcher_headers)
    assert xlsx_response.status_code == 200
    assert xlsx_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert xlsx_response.content.startswith(b"PK")

    actions = {
        item.action
        for item in db_session.scalars(select(AuditLog).where(AuditLog.resource_type == "ResearchExportRequest"))
    }
    assert {"RESEARCH_EXPORT_REQUESTED", "RESEARCH_EXPORT_APPROVED", "RESEARCH_EXPORT_DOWNLOADED"} <= actions


def test_research_export_supports_json_download_from_approved_snapshot(client: TestClient, db_session, monkeypatch):
    monkeypatch.setattr(settings, "RESEARCH_EXPORT_SALT", "test-research-salt")
    user_headers = login(client, "json-subject@example.com", "USER", organization_id=1)
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "JSON 下载用户",
            "sex": "男",
            "birth_date": "1985-01-01",
            "height_cm": 172,
            "weight_kg": 76,
            "waist_cm": 88,
            "hip_cm": 98,
            "exercise_goal": ["体能提升"],
            "exercise_habit": "每周1-2次",
            "exercise_experience": "初级",
        },
    )
    researcher_headers = login(client, "json-researcher@example.com", "RESEARCHER", organization_id=1)
    admin_headers = login(client, "json-admin@example.com", "ADMIN")

    created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "json", "purpose": "JSON 脱敏分析"},
    )
    assert created.status_code == 201
    request_id = created.json()["id"]
    approved = client.post(
        f"/api/v1/research/export/requests/{request_id}/approve",
        headers=admin_headers,
        json={"approval_comment": "同意 JSON 脱敏导出"},
    )
    assert approved.status_code == 200

    profile = db_session.scalar(select(UserProfile).where(UserProfile.name == "JSON 下载用户"))
    profile.weight_kg = 120
    db_session.commit()

    response = client.get(f"/api/v1/research/export/requests/{request_id}/download", headers=researcher_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["rows"][0]["weight_kg"] == 76
    serialized = json.dumps(payload, ensure_ascii=False)
    assert "JSON 下载用户" not in serialized
    assert "json-subject@example.com" not in serialized


def test_research_export_download_rejects_expired_approved_request(client: TestClient, db_session):
    researcher_headers = login(client, "expired-researcher@example.com", "RESEARCHER", organization_id=1)
    request = ResearchExportRequest(
        requested_by=1,
        organization_id=1,
        format="csv",
        purpose="过期下载",
        status="APPROVED",
        row_count=0,
        expires_at=utcnow() - timedelta(minutes=1),
        snapshot_json=[],
    )
    db_session.add(request)
    db_session.commit()

    response = client.get(f"/api/v1/research/export/requests/{request.id}/download", headers=researcher_headers)

    assert response.status_code == 403
    assert "expired" in response.json()["detail"]


def test_org_admin_cannot_approve_other_organization_export_request(client: TestClient, db_session):
    researcher_headers = login(client, "org1-researcher@example.com", "RESEARCHER", organization_id=1)
    org_admin_headers = login(client, "org2-admin@example.com", "ORG_ADMIN", organization_id=2)

    created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "csv", "purpose": "机构一研究"},
    )
    assert created.status_code == 201

    response = client.post(
        f"/api/v1/research/export/requests/{created.json()['id']}/approve",
        headers=org_admin_headers,
        json={"approval_comment": "跨机构审批"},
    )

    assert response.status_code == 403


def test_admin_can_reject_pending_research_export_request_and_download_is_forbidden(
    client: TestClient,
    db_session,
):
    researcher_headers = login(client, "reject-researcher@example.com", "RESEARCHER", organization_id=1)
    admin_headers = login(client, "reject-admin@example.com", "ADMIN")

    created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "json", "purpose": "待驳回研究申请"},
    )
    assert created.status_code == 201

    rejected = client.post(
        f"/api/v1/research/export/requests/{created.json()['id']}/reject",
        headers=admin_headers,
        json={"approval_comment": "研究用途不够明确，需补充伦理编号"},
    )

    assert rejected.status_code == 200
    body = rejected.json()
    assert body["status"] == "REJECTED"
    assert body["approved_by"] is not None
    assert body["approval_comment"] == "研究用途不够明确，需补充伦理编号"

    download = client.get(
        f"/api/v1/research/export/requests/{created.json()['id']}/download",
        headers=researcher_headers,
    )
    assert download.status_code == 403

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "RESEARCH_EXPORT_REJECTED"))
    assert log is not None
    assert log.resource_id == str(created.json()["id"])


def seed_summary_subject(
    client: TestClient,
    db_session,
    *,
    email: str,
    organization_id: int,
    risk_level: str,
    cluster_label: str,
    prescription_status: str,
    completion_rate: int,
    rpe: int,
) -> int:
    headers = login(client, email, "USER", organization_id=organization_id)
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": email,
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
    user_id = client.get("/api/v1/users/me", headers=headers).json()["id"]
    db_session.add_all(
        [
            RiskScreening(
                user_id=user_id,
                has_hypertension=risk_level in {"R2", "R3"},
                has_diabetes=False,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=False,
                has_joint_pain=False,
                recent_injury=False,
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=False,
                palpitation=False,
                medication=[],
                risk_level=risk_level,
                risk_reasons=[risk_level],
            ),
            UserClusterAssignment(
                user_id=user_id,
                rule_labels=[cluster_label],
                cluster_label=cluster_label,
                cluster_id=0,
                profile_summary=cluster_label,
                risk_override=False,
            ),
            PrescriptionRecord(
                user_id=user_id,
                risk_level=risk_level,
                cluster_label=cluster_label,
                goals=["减脂"],
                fitt_vp={"type": ["快走"]} if risk_level != "R3" else None,
                status=prescription_status,
                expert_review_required=risk_level in {"R2", "R3"},
                version=1,
            ),
            ExerciseFeedback(
                user_id=user_id,
                exercise_date=date(2026, 6, 1),
                exercise_type="快走",
                frequency_week=3,
                duration_min=20,
                intensity_level="低",
                rpe=rpe,
                completion_rate=completion_rate,
                discomfort=[],
                pain_score_after=1,
            ),
        ]
    )
    db_session.commit()
    return user_id


def test_researcher_summary_is_scoped_to_own_organization(client: TestClient, db_session):
    seed_summary_subject(
        client,
        db_session,
        email="summary-org1-user@example.com",
        organization_id=1,
        risk_level="R1",
        cluster_label="机构一分型",
        prescription_status="PUBLISHED",
        completion_rate=90,
        rpe=12,
    )
    seed_summary_subject(
        client,
        db_session,
        email="summary-org2-user@example.com",
        organization_id=2,
        risk_level="R3",
        cluster_label="机构二分型",
        prescription_status="REFERRED",
        completion_rate=40,
        rpe=18,
    )
    researcher_headers = login(client, "summary-org1-researcher@example.com", "RESEARCHER", organization_id=1)

    response = client.get("/api/v1/research/export/summary", headers=researcher_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_participants"] == 1
    assert body["risk_distribution"] == {"R1": 1}
    assert body["cluster_distribution"] == {"机构一分型": 1}
    assert body["prescription_status"] == {"PUBLISHED": 1}
    assert body["intervention_effects"]["feedback_count"] == 1
    assert body["intervention_effects"]["average_completion_rate"] == 90
    assert body["intervention_effects"]["average_rpe"] == 12


def test_org_admin_summary_is_scoped_to_own_organization(client: TestClient, db_session):
    seed_summary_subject(
        client,
        db_session,
        email="summary-admin-org1-user@example.com",
        organization_id=1,
        risk_level="R1",
        cluster_label="机构一管理员分型",
        prescription_status="PUBLISHED",
        completion_rate=88,
        rpe=11,
    )
    seed_summary_subject(
        client,
        db_session,
        email="summary-admin-org2-user@example.com",
        organization_id=2,
        risk_level="R2",
        cluster_label="机构二管理员分型",
        prescription_status="PENDING_REVIEW",
        completion_rate=66,
        rpe=15,
    )
    org_admin_headers = login(client, "summary-org2-admin@example.com", "ORG_ADMIN", organization_id=2)

    response = client.get("/api/v1/research/export/summary", headers=org_admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_participants"] == 1
    assert body["risk_distribution"] == {"R2": 1}
    assert body["cluster_distribution"] == {"机构二管理员分型": 1}
    assert body["prescription_status"] == {"PENDING_REVIEW": 1}
    assert body["intervention_effects"]["feedback_count"] == 1
    assert body["intervention_effects"]["average_completion_rate"] == 66
    assert body["intervention_effects"]["average_rpe"] == 15


def test_researcher_without_organization_cannot_create_global_export_request(client: TestClient):
    researcher_headers = login(client, "global-researcher@example.com", "RESEARCHER")

    response = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "json", "purpose": "尝试全局导出"},
    )

    assert response.status_code == 403


def test_researcher_export_rows_are_limited_to_own_organization(client: TestClient, db_session):
    seed_summary_subject(
        client,
        db_session,
        email="export-org1-user@example.com",
        organization_id=1,
        risk_level="R1",
        cluster_label="机构一",
        prescription_status="PUBLISHED",
        completion_rate=90,
        rpe=12,
    )
    seed_summary_subject(
        client,
        db_session,
        email="export-org2-user@example.com",
        organization_id=2,
        risk_level="R2",
        cluster_label="机构二",
        prescription_status="PENDING_REVIEW",
        completion_rate=70,
        rpe=14,
    )
    researcher_headers = login(client, "export-org1-researcher@example.com", "RESEARCHER", organization_id=1)
    admin_headers = login(client, "export-scope-admin@example.com", "ADMIN")

    created = client.post(
        "/api/v1/research/export/requests",
        headers=researcher_headers,
        json={"format": "json", "purpose": "机构一脱敏数据"},
    )
    assert created.status_code == 201
    request_id = created.json()["id"]
    approved = client.post(
        f"/api/v1/research/export/requests/{request_id}/approve",
        headers=admin_headers,
        json={"approval_comment": "批准机构一导出"},
    )
    assert approved.status_code == 200

    response = client.get(f"/api/v1/research/export/requests/{request_id}/download", headers=researcher_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["rows"][0]["risk_level"] == "R1"


def test_research_export_stage_change_uses_real_history_or_structured_null(client: TestClient, db_session):
    user_headers = login(client, "stage-change-user@example.com", "USER")
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "阶段变化用户",
            "sex": "男",
            "birth_date": "1978-01-01",
            "height_cm": 170,
            "weight_kg": 82,
            "waist_cm": 96,
            "hip_cm": 102,
            "exercise_goal": ["减脂", "控压"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.put(
        "/api/v1/health-data/profile",
        headers=user_headers,
        json={
            "name": "阶段变化用户",
            "sex": "男",
            "birth_date": "1978-01-01",
            "height_cm": 170,
            "weight_kg": 78,
            "waist_cm": 91,
            "hip_cm": 100,
            "exercise_goal": ["减脂", "控压"],
            "exercise_habit": "每周1-2次",
            "exercise_experience": "初级",
        },
    )
    profile = db_session.scalar(select(UserProfile).where(UserProfile.name == "阶段变化用户"))
    db_session.add_all(
        [
            FitnessTest(
                user_id=profile.user_id,
                resting_hr=82,
                sbp=146,
                dbp=94,
                pain_score=2,
                measured_at=datetime(2026, 1, 1),
            ),
            FitnessTest(
                user_id=profile.user_id,
                resting_hr=76,
                sbp=132,
                dbp=84,
                pain_score=1,
                measured_at=datetime(2026, 3, 1),
            ),
            BodyComposition(
                user_id=profile.user_id,
                body_fat_pct=33.5,
                skeletal_muscle_kg=24.0,
                measured_at=datetime(2026, 1, 1),
            ),
            BodyComposition(
                user_id=profile.user_id,
                body_fat_pct=30.0,
                skeletal_muscle_kg=25.8,
                measured_at=datetime(2026, 3, 1),
            ),
            BiochemicalIndex(
                user_id=profile.user_id,
                fbg=6.8,
                tc=5.8,
                tg=2.1,
                hdl_c=0.9,
                ldl_c=3.7,
                measured_at=datetime(2026, 1, 1),
            ),
            BiochemicalIndex(
                user_id=profile.user_id,
                fbg=6.1,
                tc=5.1,
                tg=1.6,
                hdl_c=1.1,
                ldl_c=3.1,
                measured_at=datetime(2026, 3, 1),
            ),
        ]
    )
    db_session.commit()

    rows = ResearchExportService(db_session).export_rows()

    assert len(rows) == 1
    assert "需阶段复评后计算" not in json.dumps(rows, ensure_ascii=False)
    stage_change = json.loads(rows[0]["stage_weight_bmi_waist_bp_change"])
    assert stage_change["profile"]["weight_kg"]["delta"] == -4
    assert stage_change["profile"]["bmi"]["delta"] == -1.38
    assert stage_change["profile"]["waist_cm"]["delta"] == -5
    assert stage_change["fitness_test"]["sbp"]["delta"] == -14
    assert stage_change["fitness_test"]["dbp"]["delta"] == -10
    assert stage_change["body_composition"]["body_fat_pct"]["delta"] == -3.5
    assert stage_change["body_composition"]["skeletal_muscle_kg"]["delta"] == 1.8
    assert stage_change["biochemical_index"]["fbg"]["delta"] == -0.7
    assert stage_change["biochemical_index"]["tc"]["delta"] == -0.7
    assert stage_change["biochemical_index"]["tg"]["delta"] == -0.5
    assert stage_change["biochemical_index"]["hdl_c"]["delta"] == 0.2
    assert stage_change["biochemical_index"]["ldl_c"]["delta"] == -0.6
