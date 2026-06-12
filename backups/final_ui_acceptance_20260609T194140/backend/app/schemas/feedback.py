from typing import Any

from pydantic import BaseModel


class FeedbackAdjustmentRead(BaseModel):
    action: str
    reasons: list[str]
    triggered_rules: list[str] = []
    new_prescription_id: int | None
    version_id: int | None


class PhaseAssessmentRead(BaseModel):
    prescription_id: int | None
    weeks: int
    feedback_count: int
    average_completion_rate: float
    average_rpe: float
    pain_events: int
    discomfort_events: int
    red_alert_events: int
    decision: str
    summary: str
    measurement_changes: dict[str, Any]
    recommendations: list[str]
