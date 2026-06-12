from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import utcnow


class RiskRuleConfig(Base):
    __tablename__ = "risk_rule_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    rule_type: Mapped[str] = mapped_column(String(64), default="RISK_LEVEL", index=True)
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    applies_to: Mapped[list[str]] = mapped_column(JSON, default=list)
    review_status: Mapped[str] = mapped_column(String(64), default="EXPERT_REVIEW_DRAFT", index=True)
    message: Mapped[str] = mapped_column(Text)
    condition: Mapped[dict] = mapped_column(JSON)
    contraindications: Mapped[list[str]] = mapped_column(JSON, default=list)
    intensity_cap: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
