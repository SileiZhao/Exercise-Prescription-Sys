from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FITTVP(BaseModel):
    frequency: str = Field(min_length=1)
    intensity: str = Field(min_length=1)
    time: str = Field(min_length=1)
    type: list[str] = Field(min_length=1)
    volume: str = Field(min_length=1)
    progression: str = Field(min_length=1)


class PrescriptionDraft(BaseModel):
    risk_level: Literal["R0", "R1", "R2", "R3"]
    cluster_label: str
    goals: list[str] = Field(min_length=1)
    fitt_vp: FITTVP | None
    precautions: list[str]
    contraindications: list[str]
    reassessment: str = Field(min_length=1)
    evidence_refs: list[str] = Field(default_factory=list)
    expert_review_required: bool = False
    safety_notice: str | None = None

    @model_validator(mode="after")
    def validate_safety_boundary(self):
        if self.risk_level == "R3" and self.fitt_vp is not None:
            raise ValueError("R3 用户不得包含具体 FITT-VP 训练处方")
        if self.risk_level != "R3" and self.fitt_vp is None:
            raise ValueError("R0/R1/R2 处方必须包含 FITT-VP 结构")
        if self.risk_level == "R2" and not self.expert_review_required:
            raise ValueError("R2 用户处方初稿必须标记需要专家审核")
        return self


class PrescriptionRecordRead(BaseModel):
    id: int
    user_id: int
    risk_level: str
    cluster_label: str | None
    goals: list[str]
    fitt_vp: dict | None
    precautions: list[str]
    contraindications: list[str]
    reassessment: str
    evidence_refs: list[dict]
    safety_notice: str | None
    status: str
    expert_review_required: bool
    version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
