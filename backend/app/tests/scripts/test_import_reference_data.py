import json
from datetime import date

from sqlalchemy import select

from app.models.enums import UserRole
from app.models.health_data import RiskScreening, UserProfile
from app.models.risk import RiskRuleConfig
from app.models.template import ExerciseAction
from app.models.user import User
from app.services.risk_service import RiskEvaluationService
from scripts.import_compliance_materials import import_compliance_materials
from scripts.import_risk_rules import import_risk_rules


def test_import_risk_rules_skips_r0_and_runtime_uses_configured_rules(db_session, tmp_path):
    path = tmp_path / "rules.json"
    path.write_text(
        json.dumps(
            [
                {
                    "rule_code": "DOC_R3_PARQ",
                    "rule_name": "PAR-Q 阳性",
                    "risk_level": "R3",
                    "severity": "RED",
                    "field_path": "risk_screening.parq_result",
                    "operator": "eq",
                    "value": "positive",
                    "user_message": "PAR-Q+ 阳性，需医学评估。",
                    "contraindications": ["不生成训练处方"],
                    "intensity_cap": "暂停训练",
                },
                {
                    "rule_code": "DOC_R0_DEFAULT",
                    "rule_name": "默认 R0",
                    "risk_level": "R0",
                    "severity": "GREEN",
                    "field_path": "profile.age",
                    "operator": "gte",
                    "value": 0,
                    "user_message": "不应作为配置规则导入。",
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    result = import_risk_rules(db_session, path)

    assert result == {"created": 1, "updated": 0, "skipped": 1, "errors": 0}
    assert db_session.scalar(select(RiskRuleConfig).where(RiskRuleConfig.code == "DOC_R0_DEFAULT")) is None

    user = User(
        email="risk-config@example.com",
        hashed_password="hash",
        full_name="Risk Config",
        role=UserRole.USER,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        UserProfile(
            user_id=user.id,
            name="Risk Config",
            sex="男",
            birth_date=date(1988, 1, 1),
            age=38,
            height_cm=170,
            weight_kg=70,
            bmi=24.2,
            exercise_goal=["体质提升"],
            exercise_habit="无规律运动",
            exercise_experience="初级",
        )
    )
    db_session.add(RiskScreening(user_id=user.id, parq_result="positive"))
    db_session.commit()

    evaluated = RiskEvaluationService(db_session).evaluate_current_user(user.id)

    assert evaluated.risk_level == "R3"
    assert "DOC_R3_PARQ" in [rule.code for rule in evaluated.matched_rules]


def test_import_compliance_materials_is_idempotent(db_session, tmp_path):
    path = tmp_path / "compliance.json"
    path.write_text(
        json.dumps(
            {
                "documents": [
                    {
                        "doc_code": "COMPLIANCE_INFORMED_CONSENT",
                        "title": "知情同意书",
                        "version": "v0.1",
                        "effective_date": "2026-06-01",
                        "applicable_scope": "首次建档",
                        "text": "平台不替代医疗诊断，R2 必须专家审核，R3 不生成训练处方。",
                        "short_notice": "不替代医疗诊断。",
                        "review_status": "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW",
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    first = import_compliance_materials(db_session, path)
    second = import_compliance_materials(db_session, path)

    assert first == {"created": 1, "updated": 0, "skipped": 0, "errors": 0}
    assert second == {"created": 0, "updated": 1, "skipped": 0, "errors": 0}


def test_import_exercise_actions_preserves_extended_fields(db_session, tmp_path):
    from scripts.import_exercise_actions import import_exercise_actions

    path = tmp_path / "actions.json"
    path.write_text(
        json.dumps(
            [
                {
                    "name": "扶椅深蹲",
                    "category": "抗阻",
                    "risk_level": "R1/R2",
                    "primary_muscles": ["股四头肌", "臀肌"],
                    "equipment": "椅子",
                    "difficulty": "初级",
                    "alternatives": ["减少下蹲幅度"],
                    "monitoring_tips": ["监测膝痛"],
                    "stop_signals": ["疼痛≥7/10"],
                    "evidence_or_rationale": ["专家动作库"],
                    "instructions": ["保持膝盖对齐", "不憋气"],
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    result = import_exercise_actions(db_session, path)
    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "扶椅深蹲"))

    assert result == {"created": 1, "updated": 0}
    assert action is not None
    assert action.status.value == "PENDING_REVIEW"
    assert action.instructions == "保持膝盖对齐\n不憋气"
    assert action.primary_muscles == ["股四头肌", "臀肌"]
    assert action.evidence_refs == ["专家动作库"]
