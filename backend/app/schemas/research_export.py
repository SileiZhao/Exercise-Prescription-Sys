from typing import Any

from pydantic import BaseModel


class DesensitizedUserRow(BaseModel):
    participant_code: str
    profile: dict[str, Any]
    fitness_test: dict[str, Any] | None
    risk_screening: dict[str, Any] | None
    latest_prescription: dict[str, Any] | None


class ResearchExportResponse(BaseModel):
    items: list[DesensitizedUserRow]
    total: int


class InterventionEffects(BaseModel):
    feedback_count: int
    average_completion_rate: float
    average_rpe: float
    discomfort_event_count: int
    pain_worsened_count: int


class ResearchSummaryResponse(BaseModel):
    total_participants: int
    risk_distribution: dict[str, int]
    cluster_distribution: dict[str, int]
    prescription_status: dict[str, int]
    intervention_effects: InterventionEffects
