from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import utcnow


class PrescriptionRecord(Base):
    __tablename__ = "prescription_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("prescription_templates.id"), nullable=True)
    risk_level: Mapped[str] = mapped_column(String(16), index=True)
    cluster_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    fitt_vp: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    precautions: Mapped[list[str]] = mapped_column(JSON, default=list)
    contraindications: Mapped[list[str]] = mapped_column(JSON, default=list)
    reassessment: Mapped[str] = mapped_column(String(128), default="4周小评估，12周阶段评估")
    evidence_refs: Mapped[list[dict]] = mapped_column(JSON, default=list)
    llm_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    safety_notice: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    expert_review_required: Mapped[bool] = mapped_column(default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("prescription_records.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class PrescriptionVersion(Base):
    __tablename__ = "prescription_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey("prescription_records.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    change_reason: Mapped[str] = mapped_column(String(255), default="INITIAL_GENERATION")
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReportExportRecord(Base):
    __tablename__ = "report_export_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exported_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    prescription_id: Mapped[int | None] = mapped_column(
        ForeignKey("prescription_records.id"), nullable=True, index=True
    )
    report_type: Mapped[str] = mapped_column(String(32), index=True)
    format: Mapped[str] = mapped_column(String(16), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
