from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RulePhenotypeResult(BaseModel):
    labels: list[str]
    profile_summary: str
    risk_override: bool = False


class ClusterProfile(BaseModel):
    cluster_id: int
    size: int
    center: dict[str, float]
    suggested_labels: list[str]
    explanation: str
    core_risks: list[str] = Field(default_factory=list)
    exercise_goals: list[str] = Field(default_factory=list)
    fitt_range: dict[str, str] = Field(default_factory=dict)
    contraindications: list[str] = Field(default_factory=list)
    review_recommendation: str = ""


class TrainedClusterModel(BaseModel):
    name: str
    algorithm: str = "KMeans"
    n_clusters: int
    feature_names: list[str]
    cluster_profiles: list[ClusterProfile]
    metrics: dict[str, float] = Field(default_factory=dict)
    scaler_params: dict = Field(default_factory=dict)
    model_params: dict = Field(default_factory=dict)
    model_origin: str = "bootstrap_rule_calibrated"


class ClusterModelRead(BaseModel):
    id: int
    name: str
    algorithm: str
    n_clusters: int
    feature_names: list[str]
    cluster_profiles: list[dict]
    metrics: dict
    scaler_params: dict = Field(default_factory=dict)
    model_params: dict = Field(default_factory=dict)
    model_origin: str = "bootstrap_rule_calibrated"
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClusterTrainRequest(BaseModel):
    name: str = "KMeans 人群分型模型"
    n_clusters: int = Field(default=3, ge=2, le=8)
    algorithm: Literal["KMeans", "DBSCAN", "GaussianMixture", "AgglomerativeClustering"] = "KMeans"


class ClusterModelStatusUpdate(BaseModel):
    status: Literal["TRAINED", "ACTIVE", "ARCHIVED"]
    reason: str | None = Field(default=None, max_length=500)


class UserClusterAssignmentRead(BaseModel):
    id: int
    user_id: int
    model_id: int | None
    rule_labels: list[str]
    cluster_label: str | None
    cluster_id: int | None
    profile_summary: str
    risk_override: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
