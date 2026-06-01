from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.risk import RiskEvaluationResult


class RuleConditionPayload(BaseModel):
    path: str = Field(min_length=1)
    op: Literal["eq", "gte", "between", "in_any", "not_empty_restriction"]
    value: Any = None


class RiskRuleConfigCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    severity: Literal["GREEN", "YELLOW", "RED"]
    message: str = Field(min_length=1)
    condition: RuleConditionPayload
    contraindications: list[str] = Field(default_factory=list)
    intensity_cap: str | None = None
    is_active: bool = True


class RiskRuleConfigUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    severity: Literal["GREEN", "YELLOW", "RED"] | None = None
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
