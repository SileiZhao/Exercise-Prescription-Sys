from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ComplianceDocumentRead(BaseModel):
    id: int
    code: str
    title: str
    version: str
    effective_date: str | None
    applicable_scope: str | None
    text: str
    short_notice: str | None
    checkbox_text: str | None
    evidence_refs: list[str]
    pending_confirmation: list[str]
    review_status: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
