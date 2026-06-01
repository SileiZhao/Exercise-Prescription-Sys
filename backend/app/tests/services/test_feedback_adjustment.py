from datetime import date

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
