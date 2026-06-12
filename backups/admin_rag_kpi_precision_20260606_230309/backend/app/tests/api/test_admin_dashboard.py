from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord
from app.models.review import ExpertReview
from app.models.risk import RiskRuleConfig
from app.models.template import (
    ActionReviewStatus,
    ExerciseAction,
    KnowledgeChunk,
    KnowledgeDocument,
    ComplianceDocument,
    PrescriptionTemplate,
    TemplateStatus,
)
from app.models.user import User
from app.tests.helpers import auth_headers_for_role


def user_id(db_session, email: str) -> int:
    return db_session.scalar(select(User.id).where(User.email == email))


def test_admin_dashboard_summary(client: TestClient, db_session):
    admin_headers = auth_headers_for_role(client, "dashboard-admin@example.com", "ADMIN")
    auth_headers_for_role(client, "dashboard-user-a@example.com", "USER")
    auth_headers_for_role(client, "dashboard-user-b@example.com", "USER")
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
                llm_payload={
                    "risk_rules": [
                        {"code": "DASHBOARD_R2_BP", "message": "高血压进入专家审核。"},
                        {"code": "DASHBOARD_R2_BP", "message": "高血压进入专家审核。"},
                    ]
                },
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
            RiskRuleConfig(
                code="DASHBOARD_R2_BP",
                name="看板高血压规则",
                severity="YELLOW",
                priority=10,
                rule_type="RISK_LEVEL",
                message="高血压进入专家审核。",
                condition={"path": "risk_screening.has_hypertension", "op": "eq", "value": True},
                contraindications=["避免憋气"],
                is_active=True,
            ),
            RiskRuleConfig(
                code="DASHBOARD_ARCHIVED",
                name="停用规则",
                severity="GREEN",
                priority=100,
                rule_type="RISK_LEVEL",
                message="停用规则不进入启用统计。",
                condition={"path": "profile.bmi", "op": "gte", "value": 24},
                contraindications=[],
                is_active=False,
            ),
            ExerciseAction(
                name="看板快走",
                category="有氧",
                risk_level="R1",
                intensity="低",
                status=ActionReviewStatus.APPROVED,
            ),
            ExerciseAction(
                name="看板待审动作",
                category="抗阻",
                risk_level="R2",
                intensity="低",
                status=ActionReviewStatus.PENDING_REVIEW,
            ),
            ComplianceDocument(
                code="CONFIRMED_NOTICE",
                title="已确认提示",
                text="内容",
                review_status="CONFIRMED",
                pending_confirmation=[],
                status="ACTIVE",
            ),
            ComplianceDocument(
                code="DRAFT_NOTICE",
                title="草稿提示",
                text="内容",
                review_status="DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW",
                pending_confirmation=["法务"],
                status="ACTIVE",
            ),
        ]
    )
    db_session.flush()
    r2_prescription = db_session.scalar(select(PrescriptionRecord).where(PrescriptionRecord.risk_level == "R2"))
    dashboard_template = db_session.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.name == "看板模板"))
    r2_prescription.template_id = dashboard_template.id
    knowledge = KnowledgeDocument(
        title="看板知识文档",
        category="指南",
        source="专家共识",
        status="ACTIVE",
    )
    db_session.add(knowledge)
    skipped_knowledge = KnowledgeDocument(
        title="跳过知识文档",
        category="指南",
        source="扫描件",
        status="SKIPPED",
        skipped_reason="OCR disabled",
    )
    db_session.add(skipped_knowledge)
    db_session.flush()
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
            KnowledgeChunk(
                document_id=knowledge.id,
                chunk_index=0,
                content="高血压用户以低强度起步。",
                tags=["R2"],
                embedding_ref="qdrant:exercise_prescription_knowledge:1",
            ),
            KnowledgeChunk(
                document_id=knowledge.id,
                chunk_index=1,
                content="出现胸痛应停止。",
                tags=["R3"],
                embedding_ref=None,
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
    assert body["prescription_trend"][0]["generated"] == 2
    assert body["prescription_trend"][0]["published"] == 0
    assert body["rule_hit_rank"][0] == {"rule": "DASHBOARD_R2_BP", "count": 2}
    assert body["template_usage_rank"][0] == {"template": "看板模板", "count": 1}
    assert body["reference_data_status"]["risk_rules"]["total"] == 2
    assert body["reference_data_status"]["risk_rules"]["active"] == 1
    assert body["reference_data_status"]["actions"]["approved"] == 1
    assert body["reference_data_status"]["actions"]["pending_review"] == 1
    assert body["reference_data_status"]["approved_actions_count"] == 1
    assert body["reference_data_status"]["pending_actions_count"] == 1
    assert body["reference_data_status"]["confirmed_compliance_count"] == 1
    assert body["reference_data_status"]["draft_compliance_count"] == 1
    assert body["reference_data_status"]["templates"]["approved"] == 1
    assert body["reference_data_status"]["knowledge"]["documents"] == 1
    assert body["reference_data_status"]["knowledge"]["skipped_documents"] == 1
    assert body["reference_data_status"]["rag_active_documents_count"] == 1
    assert body["reference_data_status"]["rag_skipped_documents_count"] == 1
    assert body["reference_data_status"]["knowledge"]["chunks"] == 2
    assert body["reference_data_status"]["knowledge"]["indexed_chunks"] == 1
    assert body["reference_data_status"]["llm"]["provider"] == "mock"
    assert body["reference_data_status"]["llm"]["production_ready"] is False
    assert body["reference_data_status"]["embedding_provider"] == "hash"
    assert body["reference_data_status"]["ocr_enabled"] is False
    assert body["reference_data_status"]["llm_provider"] == "mock"
    assert body["reference_data_status"]["ollama_ready"] is False
    assert body["reference_data_status"]["embedding"]["provider"] == "hash"
    assert body["reference_data_status"]["ocr"]["provider"] == "paddleocr"


def test_admin_dashboard_marks_local_llm_unready_for_production(
    client: TestClient,
    monkeypatch,
):
    admin_headers = auth_headers_for_role(client, "dashboard-local-llm-admin@example.com", "ADMIN")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")
    monkeypatch.setattr(settings, "LOCAL_LLM_MODEL", "gemma3:latest")

    response = client.get("/api/v1/admin/dashboard/summary", headers=admin_headers)

    assert response.status_code == 200
    llm = response.json()["reference_data_status"]["llm"]
    assert llm["provider"] == "ollama"
    assert llm["status"] == "down"
    assert llm["production_ready"] is False
    assert response.json()["reference_data_status"]["ollama_ready"] is False
