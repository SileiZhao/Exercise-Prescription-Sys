from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.risk import RiskEvaluationResult


class RuleConditionPayload(BaseModel):
    path: str = Field(min_length=1)
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte", "between", "in_any", "contains", "not_empty_restriction", "exists"]
    value: Any = None


class RiskRuleConfigCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    severity: Literal["GREEN", "YELLOW", "RED"]
    priority: int = 100
    rule_type: str = Field(default="RISK_LEVEL", min_length=1, max_length=64)
    source_ref: str | None = None
    applies_to: list[str] = Field(default_factory=list)
    review_status: str = Field(default="EXPERT_REVIEW_DRAFT", min_length=1, max_length=64)
    message: str = Field(min_length=1)
    condition: RuleConditionPayload
    contraindications: list[str] = Field(default_factory=list)
    intensity_cap: str | None = None
    is_active: bool = True


class RiskRuleConfigUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    severity: Literal["GREEN", "YELLOW", "RED"] | None = None
    priority: int | None = None
    rule_type: str | None = Field(default=None, min_length=1, max_length=64)
    source_ref: str | None = None
    applies_to: list[str] | None = None
    review_status: str | None = Field(default=None, min_length=1, max_length=64)
    message: str | None = Field(default=None, min_length=1)
    condition: RuleConditionPayload | None = None
    contraindications: list[str] | None = None
    intensity_cap: str | None = None
    is_active: bool | None = None


class RiskRuleConfigRead(BaseModel):
    id: int
    code: str
    name: str
    severity: str
    priority: int
    rule_type: str
    source_ref: str | None
    applies_to: list[str]
    review_status: str
    message: str
    condition: dict[str, Any]
    contraindications: list[str]
    intensity_cap: str | None
    is_active: bool
    version: int
    created_by: int | None
    updated_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RiskRuleTestRequest(BaseModel):
    snapshot: dict[str, Any]


class RiskRuleTestResult(RiskEvaluationResult):
    pass
