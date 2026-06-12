from typing import Any, Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["R0", "R1", "R2", "R3"]


class MatchedRiskRule(BaseModel):
    code: str
    severity: Literal["GREEN", "YELLOW", "RED"]
    message: str
    path: str | None = None


class RiskEvaluationResult(BaseModel):
    risk_level: RiskLevel
    message: str
    allow_ai_generation: bool
    allow_auto_publish: bool
    requires_expert_review: bool
    intensity_cap: str
    contraindications: list[str] = Field(default_factory=list)
    matched_rules: list[MatchedRiskRule] = Field(default_factory=list)
    source_snapshot: dict[str, Any] | None = None
