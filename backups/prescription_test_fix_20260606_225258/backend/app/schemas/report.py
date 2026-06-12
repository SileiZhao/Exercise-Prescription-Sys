from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReportExportRecordRead(BaseModel):
    id: int
    user_id: int
    exported_by: int
    prescription_id: int | None
    report_type: str
    format: str
    filename: str
    risk_level: str | None
    status: str | None
    version: int | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportExportRecordList(BaseModel):
    total: int
    items: list[ReportExportRecordRead]
