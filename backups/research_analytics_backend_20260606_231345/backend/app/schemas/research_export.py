from typing import Any

from pydantic import BaseModel, Field


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


class ResearchExportRequestCreate(BaseModel):
    format: str = Field(pattern="^(csv|xlsx|json)$")
    purpose: str = Field(min_length=2, max_length=500)


class ResearchExportApproval(BaseModel):
    approval_comment: str = Field(min_length=1, max_length=500)


class ResearchExportRequestRead(BaseModel):
    id: int
    requested_by: int
    organization_id: int | None = None
    format: str
    purpose: str
    status: str
    approved_by: int | None
    approval_comment: str | None
    row_count: int
    expires_at: str | None
    downloaded_at: str | None
    created_at: str
