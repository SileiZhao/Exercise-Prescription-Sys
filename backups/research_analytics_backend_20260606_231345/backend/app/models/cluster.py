from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import utcnow


class ClusterModel(Base):
    __tablename__ = "cluster_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    algorithm: Mapped[str] = mapped_column(String(32), default="KMeans")
    n_clusters: Mapped[int] = mapped_column(Integer)
    feature_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    scaler_params: Mapped[dict] = mapped_column(JSON, default=dict)
    model_params: Mapped[dict] = mapped_column(JSON, default=dict)
    cluster_profiles: Mapped[list[dict]] = mapped_column(JSON, default=list)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    model_origin: Mapped[str] = mapped_column(String(64), default="bootstrap_rule_calibrated")
    status: Mapped[str] = mapped_column(String(32), default="TRAINED", index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserClusterAssignment(Base):
    __tablename__ = "user_cluster_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("cluster_models.id"), nullable=True)
    rule_labels: Mapped[list[str]] = mapped_column(JSON, default=list)
    cluster_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profile_summary: Mapped[str] = mapped_column(Text)
    risk_override: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
