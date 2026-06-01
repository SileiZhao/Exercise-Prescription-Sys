from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.template import ActionReviewStatus, TemplateStatus


class ExerciseActionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    category: str
    suitable_tags: list[str] = Field(default_factory=list)
    contraindication_tags: list[str] = Field(default_factory=list)
    risk_level: str = "R1"
    body_parts: list[str] = Field(default_factory=list)
    primary_muscles: list[str] = Field(default_factory=list)
    equipment: str | None = None
    intensity: str = "低"
    difficulty: str | None = None
    instructions: str | None = None
    alternatives: list[str] = Field(default_factory=list)
    common_mistakes: list[str] = Field(default_factory=list)
    monitoring_tips: list[str] = Field(default_factory=list)
    stop_signals: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)


class ExerciseActionRead(ExerciseActionCreate):
    id: int
    status: ActionReviewStatus
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExerciseActionReview(BaseModel):
    status: ActionReviewStatus
    comment: str | None = Field(default=None, max_length=500)


class PrescriptionTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    risk_level: str
    cluster_tags: list[str] = Field(default_factory=list)
    goal_tags: list[str] = Field(default_factory=list)
    fitt_vp: dict[str, Any] | None
    precautions: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    status: TemplateStatus = TemplateStatus.DRAFT
    version: int = 1

    @model_validator(mode="after")
    def validate_risk_template_shape(self) -> "PrescriptionTemplateCreate":
        if self.risk_level == "R3":
            if self.fitt_vp is not None:
                raise ValueError("R3 安全提醒模板不能包含 FITT-VP 对象。")
            return self
        if self.fitt_vp is None:
            raise ValueError("R0-R2 处方模板必须包含 FITT-VP 对象。")
        return self


class PrescriptionTemplateRead(PrescriptionTemplateCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TemplateMatchRequest(BaseModel):
    risk_level: str
    cluster_labels: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
