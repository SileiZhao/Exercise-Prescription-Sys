from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus
from app.services.knowledge_service import KnowledgeIngestionService
from app.services.prescription_orchestrator import PrescriptionOrchestrator


def add_template(db_session, risk_level: str):
    template = PrescriptionTemplate(
        name=f"{risk_level} FITT-VP 模板",
        risk_level=risk_level,
        cluster_tags=["肥胖代谢风险型", "初级运动水平", "普通健康维持型"],
        goal_tags=["减脂", "增强心肺", "体质提升"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走", "八段锦"],
            "volume": "每周120分钟",
            "progression": "每2-4周根据反馈调整",
        },
        precautions=["监测RPE", "运动中出现胸闷头晕应停止并评估"],
        contraindications=["高强度冲刺"],
        status=TemplateStatus.APPROVED,
        version=1,
    )
    db_session.add(template)
    db_session.commit()
    return template


def add_knowledge(db_session):
    return KnowledgeIngestionService(db_session).ingest_text(
        title="低风险人群运动建议",
        category="运动处方",
        content="低风险人群可从低—中等强度有氧运动开始，结合八段锦和基础抗阻训练。",
        tags=["R1", "减脂", "八段锦"],
        created_by=None,
    )


def user_id_from_token(client, email: str, role: str = "USER") -> tuple[int, dict[str, str]]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": "处方用户",
            "role": role,
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if role == "USER":
        client.post(
            "/api/v1/health-data/consent",
            headers=headers,
            json={
                "consent_version": "2026-v1",
                "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
            },
        )
    me = client.get("/api/v1/users/me", headers=headers)
    return me.json()["id"], headers


def submit_health(client, headers, *, r2: bool = False, r3: bool = False):
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "处方用户",
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
        json={"resting_hr": 78, "sbp": 145 if r2 else 128, "dbp": 92 if r2 else 82, "pain_score": 7 if r3 else 1},
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
        json={"has_hypertension": r2, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )


def test_prescription_orchestrator_auto_publishes_r1(client, db_session):
    add_template(db_session, "R1")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-r1@example.com")
    submit_health(client, headers)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert record.status == "PUBLISHED"
    assert record.risk_level == "R1"
    assert record.version == 1
    assert record.fitt_vp["frequency"] == "每周4次"
    assert record.expert_review_required is False
    assert record.evidence_refs


def test_prescription_orchestrator_routes_r2_to_review(client, db_session):
    add_template(db_session, "R2")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-r2@example.com")
    submit_health(client, headers, r2=True)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert record.status == "PENDING_REVIEW"
    assert record.risk_level == "R2"
    assert record.expert_review_required is True
    assert record.fitt_vp is not None


def test_prescription_orchestrator_sends_only_approved_actions_to_llm(client, db_session):
    add_template(db_session, "R1")
    add_knowledge(db_session)
    approved = ExerciseAction(
        name="快走",
        category="有氧",
        risk_level="R1",
        suitable_tags=["减脂", "初级运动水平"],
        contraindication_tags=["胸痛"],
        body_parts=["下肢", "心肺"],
        intensity="低-中",
        instructions="平地快走，保持可交谈强度。",
        status=ActionReviewStatus.APPROVED,
    )
    pending = ExerciseAction(
        name="跳箱",
        category="爆发力",
        risk_level="R1",
        suitable_tags=["减脂"],
        contraindication_tags=["膝痛"],
        intensity="高",
        status=ActionReviewStatus.PENDING_REVIEW,
    )
    db_session.add_all([approved, pending])
    db_session.commit()
    user_id, headers = user_id_from_token(client, "rx-actions@example.com")
    submit_health(client, headers)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    action_names = [item["name"] for item in record.llm_payload["candidate_actions"]]
    assert action_names == ["快走"]
    assert record.llm_payload["candidate_actions"][0]["contraindication_tags"] == ["胸痛"]


def test_prescription_orchestrator_refers_r3_without_training_plan(client, db_session):
    user_id, headers = user_id_from_token(client, "rx-r3@example.com")
    submit_health(client, headers, r3=True)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert record.status == "REFERRED"
    assert record.risk_level == "R3"
    assert record.fitt_vp is None
    assert "医学评估" in record.safety_notice
