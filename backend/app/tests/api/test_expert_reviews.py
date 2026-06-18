from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.health_data import ExerciseFeedback, FitnessTest, UserProfile
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus
from app.models.user import Organization, User
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
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

    start = client.post(f"/api/v1/expert-reviews/{prescription_id}/start", headers=expert_headers)
    assert start.status_code == 200

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
    version = db_session.scalar(
        select(PrescriptionVersion).where(PrescriptionVersion.prescription_id == prescription_id, PrescriptionVersion.version == 2)
    )
    assert version is not None
    assert version.change_reason == "EXPERT_APPROVE"
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPERT_APPROVE_PRESCRIPTION")) is not None


def test_expert_approve_runs_safety_check_before_publishing(client: TestClient, db_session):
    prescription_id = seed_r2_prescription(client, db_session)
    expert_headers = login(client, "expert-safety@example.com", "EXPERT")

    start = client.post(f"/api/v1/expert-reviews/{prescription_id}/start", headers=expert_headers)
    assert start.status_code == 200

    response = client.post(
        f"/api/v1/expert-reviews/{prescription_id}/approve",
        headers=expert_headers,
        json={
            "review_comment": "移除不适合高血压用户的高强度内容后发布。",
            "edited_prescription": {
                "fitt_vp": {
                    "frequency": "每周5次",
                    "intensity": "高强度HIIT",
                    "time": "每次45分钟",
                    "type": ["HIIT冲刺", "大重量深蹲", "快走"],
                    "volume": "每周225分钟",
                    "progression": "每周增加冲刺和大重量抗阻",
                },
                "precautions": ["监测RPE"],
                "contraindications": ["避免憋气和大负荷力量训练"],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()["prescription"]
    assert body["fitt_vp"]["intensity"] == "低强度起步"
    assert body["fitt_vp"]["type"] == ["快走", "八段锦"]
    assert "HIIT冲刺" not in body["fitt_vp"]["type"]
    assert "大重量深蹲" not in body["fitt_vp"]["type"]


def test_expert_cannot_approve_referred_r3_as_training_prescription(client: TestClient, db_session):
    user_headers = login(client, "review-r3-user@example.com", "USER")
    user = client.get("/api/v1/users/me", headers=user_headers).json()
    record = PrescriptionRecord(
        user_id=user["id"],
        risk_level="R3",
        cluster_label="高风险转介型",
        goals=["安全评估"],
        fitt_vp=None,
        precautions=["医学评估"],
        contraindications=["禁止训练处方"],
        reassessment="医学评估后再确定运动计划",
        evidence_refs=[],
        llm_payload={},
        safety_notice="当前存在高风险信号",
        status="REFERRED",
        expert_review_required=True,
        version=1,
    )
    db_session.add(record)
    db_session.commit()
    expert_headers = login(client, "expert-r3@example.com", "EXPERT")
    start = client.post(f"/api/v1/expert-reviews/{record.id}/start", headers=expert_headers)
    assert start.status_code == 200

    response = client.post(
        f"/api/v1/expert-reviews/{record.id}/approve",
        headers=expert_headers,
        json={
            "review_comment": "尝试批准训练处方。",
            "edited_prescription": {
                "fitt_vp": {
                    "frequency": "每周3次",
                    "intensity": "低强度",
                    "time": "每次20分钟",
                    "type": ["快走"],
                    "volume": "每周60分钟",
                    "progression": "2周后调整",
                }
            },
        },
    )

    assert response.status_code == 400
    assert "转介处方不能批准" in response.json()["detail"]


def test_expert_review_detail_includes_traceability_context(client: TestClient, db_session):
    prescription_id = seed_r2_prescription(client, db_session)
    expert_headers = login(client, "expert-detail@example.com", "EXPERT")
    start = client.post(f"/api/v1/expert-reviews/{prescription_id}/start", headers=expert_headers)
    assert start.status_code == 200

    response = client.get(f"/api/v1/expert-reviews/{prescription_id}", headers=expert_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["prescription"]["id"] == prescription_id
    assert body["health_snapshot"]["profile"]["name"] == "审核用户"
    assert body["risk_rules"]
    assert body["template"]["name"] == "R2审核模板"
    assert "evidence_refs" in body
    assert "candidate_actions" in body


def test_expert_review_queue_filters_stats_and_extended_actions(client: TestClient, db_session):
    org = Organization(name="示范机构")
    user = User(
        email="review-filter-user@example.com",
        hashed_password="hash",
        full_name="筛选用户",
        role="USER",
        organization=org,
    )
    other_user = User(
        email="review-filter-other@example.com",
        hashed_password="hash",
        full_name="其他用户",
        role="USER",
    )
    db_session.add_all([org, user, other_user])
    db_session.flush()
    expert_headers = auth_headers_for_role(client, "expert-filter@example.com", "EXPERT", organization_id=org.id)
    target = PrescriptionRecord(
        user_id=user.id,
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
        safety_notice="异常反馈后进入复核",
    )
    other = PrescriptionRecord(
        user_id=other_user.id,
        risk_level="R3",
        goals=["医学评估"],
        fitt_vp=None,
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="REFERRED",
        expert_review_required=True,
        version=1,
    )
    db_session.add_all([target, other])
    db_session.flush()
    db_session.add(
        ExerciseFeedback(
            user_id=user.id,
            prescription_id=target.id,
            exercise_date=date(2026, 6, 1),
            exercise_type="快走",
            frequency_week=1,
            duration_min=10,
            intensity_level="低",
            rpe=18,
            completion_rate=50,
            discomfort=["胸闷"],
        )
    )
    db_session.commit()

    queue = client.get(
        f"/api/v1/expert-reviews?risk_level=R2&status=PENDING_REVIEW&organization_id={org.id}&prescription_type=training&abnormal_feedback=true",
        headers=expert_headers,
    )

    assert queue.status_code == 200
    body = queue.json()
    assert [item["prescription_id"] for item in body] == [target.id]
    assert body[0]["organization_id"] == org.id
    assert body[0]["abnormal_feedback_count"] == 1

    id_search = client.get(
        f"/api/v1/expert-reviews?search={target.id}",
        headers=expert_headers,
    )
    assert id_search.status_code == 200
    assert [item["prescription_id"] for item in id_search.json()] == [target.id]

    empty_search = client.get(
        "/api/v1/expert-reviews?search=definitely-no-match",
        headers=expert_headers,
    )
    assert empty_search.status_code == 200
    assert empty_search.json() == []

    stats = client.get("/api/v1/expert-reviews/stats", headers=expert_headers)

    assert stats.status_code == 200
    stats_body = stats.json()
    assert stats_body["r2_pending_count"] >= 1
    assert "average_review_hours" in stats_body
    assert "timeout_count" in stats_body

    start = client.post(f"/api/v1/expert-reviews/{target.id}/start", headers=expert_headers)
    assert start.status_code == 200

    require_info = client.post(
        f"/api/v1/expert-reviews/{target.id}/request-info",
        headers=expert_headers,
        json={"review_comment": "请补充近期血压记录。"},
    )
    assert require_info.status_code == 200
    db_session.refresh(target)
    assert target.status == "NEEDS_INFO"
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPERT_REQUEST_INFO")) is not None

    target.status = "PENDING_REVIEW"
    db_session.commit()
    pause = client.post(
        f"/api/v1/expert-reviews/{target.id}/pause",
        headers=expert_headers,
        json={"review_comment": "异常反馈期间暂停运动。"},
    )
    assert pause.status_code == 200
    db_session.refresh(target)
    assert target.status == "PAUSED"
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPERT_PAUSE_PRESCRIPTION")) is not None


def test_expert_review_stats_never_report_negative_review_hours(client: TestClient, db_session):
    user = User(
        email="review-negative-duration-user@example.com",
        hashed_password="hash",
        full_name="审核时长异常用户",
        role="USER",
    )
    db_session.add(user)
    db_session.flush()
    record = PrescriptionRecord(
        user_id=user.id,
        risk_level="R2",
        goals=["控压"],
        fitt_vp={"frequency": "每周3次", "type": ["快走"]},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=True,
        version=1,
    )
    db_session.add(record)
    db_session.flush()
    review_created_at = datetime(2026, 6, 5, 12, 0)
    db_session.add(
        ExpertReview(
            prescription_id=record.id,
            user_id=user.id,
            status="APPROVED",
            action="APPROVE",
            edited_prescription={},
            created_at=review_created_at,
            reviewed_at=review_created_at - timedelta(hours=2),
        )
    )
    db_session.commit()
    admin_headers = auth_headers_for_role(client, "review-stats-admin@example.com", "ADMIN")

    stats = client.get("/api/v1/expert-reviews/stats", headers=admin_headers)

    assert stats.status_code == 200
    assert stats.json()["average_review_hours"] == 0.0


def test_expert_review_date_filters_start_action_and_detail_history(client: TestClient, db_session):
    expert_headers = login(client, "expert-history@example.com", "EXPERT")
    user = User(
        email="review-history-user@example.com",
        hashed_password="hash",
        full_name="趋势用户",
        role="USER",
    )
    other_user = User(
        email="review-history-other@example.com",
        hashed_password="hash",
        full_name="范围外用户",
        role="USER",
    )
    db_session.add_all([user, other_user])
    db_session.flush()
    target = PrescriptionRecord(
        user_id=user.id,
        risk_level="R2",
        goals=["控压"],
        fitt_vp={"frequency": "每周3次", "type": ["快走"]},
        precautions=["监测血压"],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PENDING_REVIEW",
        expert_review_required=True,
        version=2,
        created_at=datetime(2026, 6, 2, 9, 30),
    )
    older = PrescriptionRecord(
        user_id=other_user.id,
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
        created_at=datetime(2026, 5, 20, 9, 30),
    )
    db_session.add_all([target, older])
    db_session.flush()
    db_session.add_all(
        [
            PrescriptionVersion(
                prescription_id=target.id,
                version=1,
                snapshot={"status": "PENDING_REVIEW", "fitt_vp": {"frequency": "每周2次"}},
                change_reason="AI_DRAFT",
                created_at=datetime(2026, 6, 1, 9, 0),
            ),
            PrescriptionVersion(
                prescription_id=target.id,
                version=2,
                snapshot={"status": "PENDING_REVIEW", "fitt_vp": {"frequency": "每周3次"}},
                change_reason="EXPERT_REQUEST_INFO",
                actor_id=None,
                created_at=datetime(2026, 6, 2, 9, 0),
            ),
            FitnessTest(
                user_id=user.id,
                resting_hr=80,
                sbp=150,
                dbp=95,
                pain_score=1,
                measured_at=datetime(2026, 6, 1, 8, 0),
            ),
            FitnessTest(
                user_id=user.id,
                resting_hr=76,
                sbp=146,
                dbp=91,
                pain_score=1,
                measured_at=datetime(2026, 6, 3, 8, 0),
            ),
            ExerciseFeedback(
                user_id=user.id,
                prescription_id=target.id,
                exercise_date=date(2026, 6, 1),
                exercise_type="快走",
                frequency_week=1,
                duration_min=20,
                intensity_level="低",
                rpe=15,
                completion_rate=58,
            ),
            ExerciseFeedback(
                user_id=user.id,
                prescription_id=target.id,
                exercise_date=date(2026, 6, 3),
                exercise_type="快走",
                frequency_week=2,
                duration_min=25,
                intensity_level="低",
                rpe=13,
                completion_rate=72,
            ),
        ]
    )
    db_session.commit()

    queue = client.get(
        "/api/v1/expert-reviews?start_date=2026-06-01&end_date=2026-06-03",
        headers=expert_headers,
    )

    assert queue.status_code == 200
    assert [item["prescription_id"] for item in queue.json()] == [target.id]

    start = client.post(f"/api/v1/expert-reviews/{target.id}/start", headers=expert_headers)

    assert start.status_code == 200
    db_session.refresh(target)
    review = db_session.scalar(select(ExpertReview).where(ExpertReview.prescription_id == target.id))
    assert review is not None
    assert review.status == "IN_REVIEW"
    assert review.action == "START"
    assert review.expert_id is not None
    assert target.status == "IN_REVIEW"
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "EXPERT_START_REVIEW")) is not None

    detail = client.get(f"/api/v1/expert-reviews/{target.id}", headers=expert_headers)

    assert detail.status_code == 200
    body = detail.json()
    assert [version["version"] for version in body["versions"]] == [1, 2]
    assert body["versions"][0]["change_reason"] == "AI_DRAFT"
    assert body["trends"]["blood_pressure"] == ["150/95", "146/91"]
    assert body["trends"]["feedback_completion"] == [58, 72]


def seed_manual_review_record(db_session, *, org_name: str, email: str, status_value: str = "PENDING_REVIEW"):
    org = Organization(name=org_name)
    user = User(
        email=email,
        hashed_password="hash",
        full_name=email,
        role="USER",
        organization=org,
    )
    db_session.add_all([org, user])
    db_session.flush()
    db_session.add(
        UserProfile(
            user_id=user.id,
            name=email,
            sex="男",
            birth_date=date(1988, 1, 1),
            age=38,
            height_cm=170,
            weight_kg=76,
            bmi=26.3,
            waist_cm=88,
            hip_cm=96,
            whr=0.92,
            exercise_goal=["控压"],
            exercise_habit="无规律运动",
            exercise_experience="初级",
        )
    )
    record = PrescriptionRecord(
        user_id=user.id,
        risk_level="R2",
        goals=["控压"],
        fitt_vp={"frequency": "每周3次", "type": ["快走"]},
        precautions=["监测血压"],
        contraindications=["避免憋气"],
        evidence_refs=[],
        llm_payload={},
        status=status_value,
        expert_review_required=True,
        version=1,
    )
    db_session.add(record)
    db_session.flush()
    review = ExpertReview(
        prescription_id=record.id,
        user_id=user.id,
        status="PENDING" if status_value == "PENDING_REVIEW" else "IN_REVIEW",
        edited_prescription={},
    )
    db_session.add(review)
    db_session.commit()
    return org, user, record, review


def test_org_admin_review_queue_is_scoped_to_own_organization(client: TestClient, db_session):
    org_a, _, record_a, _ = seed_manual_review_record(
        db_session,
        org_name="机构A",
        email="review-org-a-user@example.com",
    )
    org_b, _, record_b, _ = seed_manual_review_record(
        db_session,
        org_name="机构B",
        email="review-org-b-user@example.com",
    )
    org_admin_headers = auth_headers_for_role(
        client,
        "review-org-admin-a@example.com",
        "ORG_ADMIN",
        organization_id=org_a.id,
    )

    own_queue = client.get("/api/v1/expert-reviews", headers=org_admin_headers)
    cross_queue = client.get(
        f"/api/v1/expert-reviews?organization_id={org_b.id}",
        headers=org_admin_headers,
    )

    assert own_queue.status_code == 200
    assert [item["prescription_id"] for item in own_queue.json()] == [record_a.id]
    assert record_b.id not in [item["prescription_id"] for item in own_queue.json()]
    assert cross_queue.status_code == 403


def test_org_admin_cannot_read_or_approve_cross_org_review(client: TestClient, db_session):
    org_a, _, _, _ = seed_manual_review_record(
        db_session,
        org_name="机构A",
        email="review-cross-org-a-user@example.com",
    )
    _, _, record_b, _ = seed_manual_review_record(
        db_session,
        org_name="机构B",
        email="review-cross-org-b-user@example.com",
    )
    org_admin_headers = auth_headers_for_role(
        client,
        "review-cross-org-admin-a@example.com",
        "ORG_ADMIN",
        organization_id=org_a.id,
    )

    detail = client.get(f"/api/v1/expert-reviews/{record_b.id}", headers=org_admin_headers)
    approve = client.post(
        f"/api/v1/expert-reviews/{record_b.id}/approve",
        headers=org_admin_headers,
        json={
            "review_comment": "尝试跨机构批准。",
            "edited_prescription": {"precautions": ["跨机构不应生效"]},
        },
    )

    assert detail.status_code == 403
    assert approve.status_code == 403
    db_session.refresh(record_b)
    assert record_b.status == "PENDING_REVIEW"


def test_expert_cannot_access_review_assigned_to_another_expert(client: TestClient, db_session):
    org, _, record, review = seed_manual_review_record(
        db_session,
        org_name="分配机构",
        email="assigned-review-user@example.com",
        status_value="IN_REVIEW",
    )
    auth_headers_for_role(
        client,
        "assigned-expert-a@example.com",
        "EXPERT",
        organization_id=org.id,
    )
    expert_a = db_session.scalar(select(User).where(User.email == "assigned-expert-a@example.com"))
    expert_b_headers = auth_headers_for_role(
        client,
        "assigned-expert-b@example.com",
        "EXPERT",
        organization_id=org.id,
    )
    review.expert_id = expert_a.id
    db_session.commit()

    detail = client.get(f"/api/v1/expert-reviews/{record.id}", headers=expert_b_headers)
    approve = client.post(
        f"/api/v1/expert-reviews/{record.id}/approve",
        headers=expert_b_headers,
        json={
            "review_comment": "尝试批准他人任务。",
            "edited_prescription": {"precautions": ["不应覆盖"]},
        },
    )

    assert detail.status_code == 403
    assert approve.status_code == 403
    db_session.refresh(review)
    db_session.refresh(record)
    assert review.expert_id == expert_a.id
    assert record.status == "IN_REVIEW"


def test_expert_must_start_unassigned_review_before_reading_detail(client: TestClient, db_session):
    org, _, record, review = seed_manual_review_record(
        db_session,
        org_name="领取机构",
        email="unassigned-detail-user@example.com",
    )
    expert_headers = auth_headers_for_role(
        client,
        "unassigned-detail-expert@example.com",
        "EXPERT",
        organization_id=org.id,
    )
    expert = db_session.scalar(select(User).where(User.email == "unassigned-detail-expert@example.com"))

    detail_before_start = client.get(f"/api/v1/expert-reviews/{record.id}", headers=expert_headers)
    start = client.post(f"/api/v1/expert-reviews/{record.id}/start", headers=expert_headers)
    detail_after_start = client.get(f"/api/v1/expert-reviews/{record.id}", headers=expert_headers)

    assert detail_before_start.status_code == 403
    assert start.status_code == 200, start.text
    assert detail_after_start.status_code == 200, detail_after_start.text
    db_session.refresh(review)
    assert review.expert_id == expert.id


def test_expert_cannot_start_review_assigned_to_another_expert(client: TestClient, db_session):
    org, _, record, review = seed_manual_review_record(
        db_session,
        org_name="抢占机构",
        email="claim-review-user@example.com",
        status_value="IN_REVIEW",
    )
    auth_headers_for_role(
        client,
        "claim-expert-a@example.com",
        "EXPERT",
        organization_id=org.id,
    )
    expert_a = db_session.scalar(select(User).where(User.email == "claim-expert-a@example.com"))
    expert_b_headers = auth_headers_for_role(
        client,
        "claim-expert-b@example.com",
        "EXPERT",
        organization_id=org.id,
    )
    review.expert_id = expert_a.id
    db_session.commit()

    start = client.post(f"/api/v1/expert-reviews/{record.id}/start", headers=expert_b_headers)

    assert start.status_code == 403
    db_session.refresh(review)
    db_session.refresh(record)
    assert review.expert_id == expert_a.id
    assert record.status == "IN_REVIEW"


def test_admin_and_org_admin_actions_respect_resource_scope(client: TestClient, db_session):
    org_a, _, record_a, review_a = seed_manual_review_record(
        db_session,
        org_name="管理机构A",
        email="admin-scope-org-a-user@example.com",
        status_value="IN_REVIEW",
    )
    _, _, record_b, _ = seed_manual_review_record(
        db_session,
        org_name="管理机构B",
        email="admin-scope-org-b-user@example.com",
    )
    org_admin_headers = auth_headers_for_role(
        client,
        "admin-scope-org-admin-a@example.com",
        "ORG_ADMIN",
        organization_id=org_a.id,
    )
    platform_admin_headers = auth_headers_for_role(
        client,
        "admin-scope-platform-admin@example.com",
        "ADMIN",
    )

    org_approve = client.post(
        f"/api/v1/expert-reviews/{record_a.id}/approve",
        headers=org_admin_headers,
        json={
            "review_comment": "机构管理员只批准本机构审核。",
            "edited_prescription": {"precautions": ["本机构边界内可写入"]},
        },
    )
    cross_org_approve = client.post(
        f"/api/v1/expert-reviews/{record_b.id}/approve",
        headers=org_admin_headers,
        json={
            "review_comment": "机构管理员不得跨机构批准。",
            "edited_prescription": {"precautions": ["跨机构不应写入"]},
        },
    )
    admin_approve = client.post(
        f"/api/v1/expert-reviews/{record_b.id}/approve",
        headers=platform_admin_headers,
        json={
            "review_comment": "平台管理员保留全局管理能力。",
            "edited_prescription": {"precautions": ["平台管理员可写入"]},
        },
    )

    assert org_approve.status_code == 200, org_approve.text
    assert org_approve.json()["prescription"]["status"] == "PUBLISHED"
    assert org_approve.json()["review"]["expert_id"] is None
    assert cross_org_approve.status_code == 403
    assert admin_approve.status_code == 200, admin_approve.text
    assert admin_approve.json()["prescription"]["status"] == "PUBLISHED"
    assert admin_approve.json()["review"]["expert_id"] is None

    db_session.refresh(review_a)
    assert review_a.expert_id is None
