from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prescription import PrescriptionRecordRead


class ExpertReviewRead(BaseModel):
    id: int
    prescription_id: int
    user_id: int
    expert_id: int | None
    status: str
    review_comment: str | None
    edited_prescription: dict[str, Any]
    action: str | None
    created_at: datetime
    reviewed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ExpertReviewQueueItem(BaseModel):
    prescription_id: int
    user_id: int
    organization_id: int | None = None
    risk_level: str
    status: str
    prescription_type: str = "training"
    abnormal_feedback_count: int = 0
    version: int
    created_at: datetime
    review_id: int | None = None


class ExpertReviewAction(BaseModel):
    review_comment: str = Field(min_length=1)
    edited_prescription: dict[str, Any] = Field(default_factory=dict)


class ExpertReviewActionResult(BaseModel):
    status: str
    review: ExpertReviewRead
    prescription: PrescriptionRecordRead


class ExpertReviewDetail(BaseModel):
    prescription: PrescriptionRecordRead
    review: ExpertReviewRead
    health_snapshot: dict[str, Any]
    risk_rules: list[dict[str, Any]]
    evidence_refs: list[dict[str, Any]]
    template: dict[str, Any] | None
    candidate_actions: list[dict[str, Any]]
    versions: list[dict[str, Any]]
    trends: dict[str, Any]


class ExpertReviewStats(BaseModel):
    average_review_hours: float
    r2_pending_count: int
    timeout_count: int
