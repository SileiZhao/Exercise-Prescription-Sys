import pytest
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.prescription import PrescriptionEvidence, PrescriptionRecord
from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus
from app.schemas.prescription import PrescriptionDraft
from app.services.knowledge_service import KnowledgeIngestionService
from app.services.prescription_orchestrator import PrescriptionGenerationBlocked, PrescriptionOrchestrator


class UnsafeR2LLMProvider:
    def generate_prescription(self, payload: dict) -> PrescriptionDraft:
        return PrescriptionDraft.model_validate(
            {
                "risk_level": payload["risk_level"],
                "cluster_label": payload.get("cluster_label") or "慢病稳定型",
                "goals": payload.get("goals") or ["血压管理辅助"],
                "fitt_vp": {
                    "frequency": "每周5次",
                    "intensity": "高强度HIIT",
                    "time": "每次45分钟",
                    "type": ["HIIT冲刺", "大重量深蹲", "快走"],
                    "volume": "每周225分钟",
                    "progression": "每周增加冲刺和大重量抗阻",
                },
                "precautions": ["监测RPE"],
                "contraindications": [],
                "reassessment": "4周复评",
                "evidence_refs": payload.get("evidence_refs") or [],
                "expert_review_required": True,
                "safety_notice": "AI 初稿",
            }
        )


class FakeAliyunLLMProvider:
    model = "qwen-prod-smoke"

    def generate_prescription(self, payload: dict) -> PrescriptionDraft:
        template = payload.get("template") or {}
        return PrescriptionDraft.model_validate(
            {
                "risk_level": payload["risk_level"],
                "cluster_label": payload.get("cluster_label") or "慢病稳定型",
                "goals": payload.get("goals") or ["减脂"],
                "fitt_vp": template.get("fitt_vp"),
                "precautions": template.get("precautions") or ["监测RPE"],
                "contraindications": template.get("contraindications") or [],
                "reassessment": "4周复评",
                "evidence_refs": payload.get("evidence_refs") or [],
                "expert_review_required": payload["risk_level"] == "R2",
                "safety_notice": "AI 初稿",
            }
        )


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
    assert record.evidence_refs
    assert record.template_id is not None


def test_prescription_orchestrator_audits_template_fallback(client, db_session):
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-fallback@example.com")
    submit_health(client, headers, r2=True)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_TEMPLATE_FALLBACK_USED"))
    assert record.template_id is None
    assert log is not None
    assert log.metadata_json["risk_level"] == "R2"


def test_production_generation_blocks_without_approved_template(client, db_session, monkeypatch):
    monkeypatch.setattr("app.services.prescription_orchestrator.settings.ENVIRONMENT", "production")
    add_knowledge(db_session)
    db_session.add(
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R1",
            suitable_tags=["减脂", "初级运动水平"],
            contraindication_tags=["胸痛"],
            intensity="低",
            status=ActionReviewStatus.APPROVED,
        )
    )
    db_session.commit()
    user_id, headers = user_id_from_token(client, "rx-prod-no-template@example.com")
    submit_health(client, headers)

    with pytest.raises(PrescriptionGenerationBlocked) as exc_info:
        PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert exc_info.value.reason == "no_approved_template"
    assert db_session.scalars(select(PrescriptionRecord)).all() == []
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_GENERATION_BLOCKED"))
    assert log is not None
    assert log.metadata_json["reason"] == "no_approved_template"


def test_production_generation_blocks_without_approved_candidate_actions(client, db_session, monkeypatch):
    monkeypatch.setattr("app.services.prescription_orchestrator.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    add_template(db_session, "R1")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-prod-no-actions@example.com")
    submit_health(client, headers)

    with pytest.raises(PrescriptionGenerationBlocked) as exc_info:
        PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert exc_info.value.reason == "no_candidate_actions"
    assert db_session.scalars(select(PrescriptionRecord)).all() == []
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_GENERATION_BLOCKED"))
    assert log is not None
    assert log.metadata_json["reason"] == "no_candidate_actions"


def test_production_generation_blocks_without_rag_evidence(client, db_session, monkeypatch):
    monkeypatch.setattr("app.services.prescription_orchestrator.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    add_template(db_session, "R1")
    db_session.add(
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R1",
            suitable_tags=["减脂", "初级运动水平"],
            contraindication_tags=["胸痛"],
            intensity="低",
            status=ActionReviewStatus.APPROVED,
        )
    )
    db_session.commit()
    user_id, headers = user_id_from_token(client, "rx-prod-no-rag@example.com")
    submit_health(client, headers)

    with pytest.raises(PrescriptionGenerationBlocked) as exc_info:
        PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert exc_info.value.reason == "rag_evidence_empty"
    assert db_session.scalars(select(PrescriptionRecord)).all() == []
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_GENERATION_BLOCKED"))
    assert log is not None
    assert log.metadata_json["reason"] == "rag_evidence_empty"


def test_production_generation_blocks_when_rag_uses_keyword_fallback_after_vector_failure(
    client,
    db_session,
    monkeypatch,
):
    monkeypatch.setattr("app.services.prescription_orchestrator.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)
    monkeypatch.setattr(
        "app.services.knowledge_service.KnowledgeRetrievalService._retrieve_from_vector_store",
        lambda self, query, tags, limit: (_ for _ in ()).throw(RuntimeError("vector store unavailable")),
    )
    add_template(db_session, "R1")
    add_knowledge(db_session)
    db_session.add(
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R1",
            suitable_tags=["减脂", "初级运动水平"],
            contraindication_tags=["胸痛"],
            intensity="低",
            status=ActionReviewStatus.APPROVED,
        )
    )
    db_session.commit()
    user_id, headers = user_id_from_token(client, "rx-prod-rag-fallback@example.com")
    submit_health(client, headers)

    with pytest.raises(PrescriptionGenerationBlocked) as exc_info:
        PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert exc_info.value.reason == "rag_retrieval_degraded"
    assert db_session.scalars(select(PrescriptionRecord)).all() == []
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_GENERATION_BLOCKED"))
    assert log is not None
    assert log.metadata_json["reason"] == "rag_retrieval_degraded"
    assert log.metadata_json["fallback_reason"] == "vector store unavailable"


def test_prescription_orchestrator_audits_rag_retrieval(client, db_session):
    add_template(db_session, "R1")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-rag-audit@example.com")
    submit_health(client, headers)

    PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "RAG_RETRIEVE_EVIDENCE"))
    assert log is not None
    assert log.metadata_json["hit_count"] >= 1
    assert log.metadata_json["chunk_ids"]


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
        impact_level="低",
        joint_stress_level="低",
        is_traditional_exercise=False,
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
    assert record.llm_payload["candidate_actions"][0]["impact_level"] == "低"
    assert record.llm_payload["candidate_actions"][0]["joint_stress_level"] == "低"


def test_prescription_orchestrator_sends_complete_context_and_warns_when_no_candidate_actions(client, db_session):
    add_template(db_session, "R2")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-context@example.com")
    submit_health(client, headers, r2=True)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert record.llm_payload["risk_result"]["risk_level"] == "R2"
    assert record.llm_payload["cluster"]["label"]
    assert record.llm_payload["template"]["id"] == record.template_id
    assert record.llm_payload["evidence"]
    assert record.llm_payload["forbidden_constraints"]
    assert record.llm_payload["candidate_actions"] == []
    log = db_session.scalar(select(AuditLog).where(AuditLog.action == "PRESCRIPTION_CANDIDATE_ACTIONS_EMPTY"))
    assert log is not None
    assert record.fitt_vp["type"] == ["快走", "八段锦"]


def test_prescription_orchestrator_persists_structured_generation_evidence(client, db_session, monkeypatch):
    monkeypatch.setattr("app.services.prescription_orchestrator.settings.LLM_PROVIDER", "aliyun")
    add_template(db_session, "R2")
    add_knowledge(db_session)
    approved = ExerciseAction(
        name="八段锦",
        category="传统运动",
        risk_level="R2",
        suitable_tags=["减脂", "初级运动水平"],
        contraindication_tags=["胸痛"],
        impact_level="低",
        joint_stress_level="低",
        intensity="低",
        status=ActionReviewStatus.APPROVED,
    )
    db_session.add(approved)
    db_session.commit()
    user_id, headers = user_id_from_token(client, "rx-evidence@example.com")
    submit_health(client, headers, r2=True)

    record = PrescriptionOrchestrator(db_session, llm_provider=FakeAliyunLLMProvider()).generate_for_user(user_id)

    evidence = db_session.scalar(
        select(PrescriptionEvidence).where(PrescriptionEvidence.prescription_id == record.id)
    )
    assert evidence is not None
    assert evidence.risk_rules
    assert evidence.template_ref["id"] == record.template_id
    assert evidence.action_refs[0]["name"] == "八段锦"
    assert evidence.rag_chunks
    assert evidence.llm_provider == "aliyun"
    assert evidence.llm_model == "qwen-prod-smoke"
    assert evidence.schema_validation["passed"] is True
    assert evidence.safety_validation["passed"] is True
    assert evidence.rag_chunks[0]["source_path"].startswith("knowledge_documents/")


def test_prescription_orchestrator_filters_llm_forbidden_actions(client, db_session):
    add_template(db_session, "R2")
    add_knowledge(db_session)
    user_id, headers = user_id_from_token(client, "rx-unsafe-llm@example.com")
    submit_health(client, headers, r2=True)

    record = PrescriptionOrchestrator(db_session, llm_provider=UnsafeR2LLMProvider()).generate_for_user(user_id)

    assert record.status == "PENDING_REVIEW"
    assert record.fitt_vp["intensity"] == "低—中等强度"
    assert record.fitt_vp["type"] == ["快走", "八段锦"]
    assert "HIIT冲刺" not in record.fitt_vp["type"]
    assert "大重量深蹲" not in record.fitt_vp["type"]
    assert "避免憋气" in "；".join(record.contraindications)


def test_prescription_orchestrator_refers_r3_without_training_plan(client, db_session):
    user_id, headers = user_id_from_token(client, "rx-r3@example.com")
    submit_health(client, headers, r3=True)

    record = PrescriptionOrchestrator(db_session).generate_for_user(user_id)

    assert record.status == "REFERRED"
    assert record.risk_level == "R3"
    assert record.fitt_vp is None
    assert "医学评估" in record.safety_notice
