from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.services.feedback_adjustment_service import FeedbackAdjustmentService


def create_prescription(db_session, user_id: int) -> PrescriptionRecord:
    record = PrescriptionRecord(
        user_id=user_id,
        risk_level="R1",
        cluster_label="肥胖代谢风险型",
        goals=["减脂", "增强心肺"],
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
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        expert_review_required=False,
        version=1,
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


def test_feedback_adjustment(db_session):
    user_id = 1
    prescription = create_prescription(db_session, user_id)
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=4,
        duration_min=30,
        intensity_level="中",
        rpe=8,
        completion_rate=85,
        discomfort=["疼痛"],
        pain_score_after=6,
    )
    db_session.add(feedback)
    db_session.commit()
    db_session.refresh(feedback)

    decision = FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert decision.action == "REVIEW_REQUIRED"
    assert "疼痛加重" in decision.reasons
    assert decision.new_prescription_id == prescription.id
    db_session.refresh(prescription)
    assert prescription.status == "PENDING_REVIEW"
    assert prescription.expert_review_required is True
    assert prescription.version == 2
    version = db_session.get(PrescriptionVersion, decision.version_id)
    assert version.change_reason == "FEEDBACK_ADJUSTMENT"


def test_feedback_red_alert_refers_prescription(db_session):
    user_id = 2
    prescription = create_prescription(db_session, user_id)
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=1,
        duration_min=10,
        intensity_level="低",
        rpe=6,
        completion_rate=30,
        discomfort=["胸闷"],
        pain_score_after=2,
    )
    db_session.add(feedback)
    db_session.commit()
    db_session.refresh(feedback)

    decision = FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert decision.action == "RED_ALERT"
    db_session.refresh(prescription)
    assert prescription.status == "REFERRED"
    assert prescription.fitt_vp is None
    assert "医学评估" in prescription.safety_notice


def test_feedback_high_blood_pressure_stops_exercise_and_records_rule_diff(db_session):
    user_id = 3
    prescription = create_prescription(db_session, user_id)
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=1,
        duration_min=10,
        intensity_level="低",
        pre_ex_bp_sbp=180,
        pre_ex_bp_dbp=95,
        rpe=6,
        completion_rate=80,
        discomfort=[],
        pain_score_after=1,
    )
    db_session.add(feedback)
    db_session.commit()

    decision = FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert decision.action == "RED_ALERT"
    assert "BP_STOP_180_110" in decision.triggered_rules
    db_session.refresh(prescription)
    assert prescription.status == "REFERRED"
    version = db_session.get(PrescriptionVersion, decision.version_id)
    assert version.snapshot["adjustment"]["triggered_rules"] == ["BP_STOP_180_110"]
    assert version.snapshot["adjustment"]["before_after_diff"]["status"] == {
        "before": "PUBLISHED",
        "after": "REFERRED",
    }


def test_feedback_glucose_out_of_range_pauses_for_review(db_session):
    user_id = 4
    prescription = create_prescription(db_session, user_id)
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=1,
        duration_min=10,
        intensity_level="低",
        pre_glucose=16.8,
        rpe=6,
        completion_rate=80,
        discomfort=[],
        pain_score_after=1,
    )
    db_session.add(feedback)
    db_session.commit()

    decision = FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert decision.action == "REVIEW_REQUIRED"
    assert "GLUCOSE_PAUSE_3_9_16_7" in decision.triggered_rules
    db_session.refresh(prescription)
    assert prescription.status == "PENDING_REVIEW"
    assert prescription.expert_review_required is True


def test_feedback_consecutive_high_rpe_degrades(db_session):
    user_id = 5
    prescription = create_prescription(db_session, user_id)
    previous = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date.today() - timedelta(days=2),
        exercise_type="快走",
        frequency_week=1,
        duration_min=20,
        intensity_level="中",
        rpe=17,
        completion_rate=85,
        discomfort=[],
        pain_score_after=1,
    )
    current = ExerciseFeedback(
        user_id=user_id,
        prescription_id=prescription.id,
        exercise_date=date.today(),
        exercise_type="快走",
        frequency_week=1,
        duration_min=20,
        intensity_level="中",
        rpe=18,
        completion_rate=85,
        discomfort=[],
        pain_score_after=1,
    )
    db_session.add_all([previous, current])
    db_session.commit()

    decision = FeedbackAdjustmentService(db_session).adjust_after_feedback(current.id)

    assert decision.action == "DEGRADE"
    assert "RPE_CONSECUTIVE_HIGH_17" in decision.triggered_rules
    db_session.refresh(prescription)
    assert prescription.status == "PUBLISHED"
    assert "单次时间减少10%-20%" in prescription.fitt_vp["progression"]


def test_feedback_adjustment_rejects_unbound_feedback_without_fallback_publish(db_session):
    user_id = 6
    pending = PrescriptionRecord(
        user_id=user_id,
        risk_level="R2",
        cluster_label="血压关注型",
        goals=["控压"],
        fitt_vp={"type": ["快走"], "intensity": "低"},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PENDING_REVIEW",
        expert_review_required=True,
        version=1,
    )
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=None,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=1,
        duration_min=20,
        intensity_level="低",
        rpe=6,
        completion_rate=90,
        discomfort=[],
        pain_score_after=1,
    )
    db_session.add_all([pending, feedback])
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert exc.value.status_code == 409
    assert "绑定" in exc.value.detail or "处方" in exc.value.detail
    db_session.refresh(pending)
    assert pending.status == "PENDING_REVIEW"
    assert pending.expert_review_required is True


def test_feedback_adjustment_rejects_non_executable_bound_prescription(db_session):
    user_id = 7
    referred = PrescriptionRecord(
        user_id=user_id,
        risk_level="R3",
        cluster_label="医学转介型",
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
    db_session.add(referred)
    db_session.flush()
    feedback = ExerciseFeedback(
        user_id=user_id,
        prescription_id=referred.id,
        exercise_date=date(2026, 5, 28),
        exercise_type="快走",
        frequency_week=1,
        duration_min=20,
        intensity_level="低",
        rpe=6,
        completion_rate=90,
        discomfort=[],
        pain_score_after=1,
    )
    db_session.add(feedback)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        FeedbackAdjustmentService(db_session).adjust_after_feedback(feedback.id)

    assert exc.value.status_code == 409
    assert "R3" in exc.value.detail or "已发布" in exc.value.detail
    db_session.refresh(referred)
    assert referred.status == "REFERRED"
    assert referred.fitt_vp is None
