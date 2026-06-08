from datetime import date
from typing import Any

from pydantic import BaseModel


class RecentFeedbackRead(BaseModel):
    exercise_date: date | None = None
    exercise_type: str | None = None
    rpe: float | None = None
    pain_score_after: int | None = None
    discomfort: list[str] = []
    completion_rate: float | None = None


class FeedbackTrendPoint(BaseModel):
    date: date
    rpe: float
    pain: int | None = None
    completion_rate: float


class HealthRadarItem(BaseModel):
    metric: str
    value: float
    max: float


class RiskRuleHitRead(BaseModel):
    rule_id: str | int | None = None
    rule_name: str | None = None
    field_path: str | None = None
    hit_value: str | int | float | bool | None = None
    threshold: str | int | float | bool | None = None
    action_label: str | None = None
    risk_level: str | None = None
    explanation: str | None = None


class UserDashboardRead(BaseModel):
    current_risk_level: str | None
    expert_review_status: str
    today_can_exercise: bool
    today_block_reason: str | None = None
    weekly_completion_rate: float
    profile_completion_rate: float
    current_stage_goals: list[str]
    recent_feedback: RecentFeedbackRead
    monitoring_reminders: list[str]
    prescription_id: int | None = None
    prescription_version: int | None = None
    next_reassessment_date: date | None = None
    streak_days: int
    weekly_target_hits: int
    plan_completion_trend: list[float]
    feedback_trend: list[FeedbackTrendPoint] = []
    health_radar: list[HealthRadarItem] = []
    abnormal_feedback_count: int
    review_status_label: str
    prescription_summary: dict[str, Any] | None = None
    risk_rule_hits: list[RiskRuleHitRead] = []
