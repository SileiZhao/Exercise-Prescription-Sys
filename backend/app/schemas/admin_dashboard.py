from pydantic import BaseModel


class FeedbackStats(BaseModel):
    total: int
    average_completion_rate: float


class TemplateUsageStats(BaseModel):
    total_templates: int
    approved_templates: int


class AdminDashboardSummary(BaseModel):
    total_users: int
    users_by_role: dict[str, int]
    risk_distribution: dict[str, int]
    prescription_status: dict[str, int]
    review_stats: dict[str, int]
    r2_review_rate: float
    r3_referral_count: int
    feedback_stats: FeedbackStats
    template_usage: TemplateUsageStats
    cluster_distribution: dict[str, int]
