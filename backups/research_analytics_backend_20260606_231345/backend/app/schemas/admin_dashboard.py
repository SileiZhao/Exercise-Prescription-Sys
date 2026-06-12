from pydantic import BaseModel


class FeedbackStats(BaseModel):
    total: int
    average_completion_rate: float


class TemplateUsageStats(BaseModel):
    total_templates: int
    approved_templates: int


class PrescriptionTrendPoint(BaseModel):
    date: str
    generated: int
    published: int


class RuleHitRankItem(BaseModel):
    rule: str
    count: int


class TemplateUsageRankItem(BaseModel):
    template: str
    count: int


class RiskRuleStatus(BaseModel):
    total: int
    active: int


class ActionStatus(BaseModel):
    approved: int
    pending_review: int


class TemplateStatusSummary(BaseModel):
    total: int
    approved: int


class KnowledgeStatus(BaseModel):
    documents: int
    skipped_documents: int = 0
    chunks: int
    indexed_chunks: int


class LLMStatus(BaseModel):
    provider: str
    production_ready: bool
    model: str | None = None
    status: str | None = None


class ComplianceStatus(BaseModel):
    confirmed: int
    draft: int


class ProviderStatus(BaseModel):
    provider: str
    model: str | None = None
    production_ready: bool | None = None
    enabled: bool | None = None
    status: str | None = None


class ReferenceDataStatus(BaseModel):
    risk_rules: RiskRuleStatus
    actions: ActionStatus
    approved_actions_count: int
    pending_actions_count: int
    compliance: ComplianceStatus
    confirmed_compliance_count: int
    draft_compliance_count: int
    templates: TemplateStatusSummary
    knowledge: KnowledgeStatus
    rag_active_documents_count: int
    rag_skipped_documents_count: int
    llm: LLMStatus
    embedding: ProviderStatus
    ocr: ProviderStatus
    embedding_provider: str
    ocr_enabled: bool
    llm_provider: str
    ollama_ready: bool


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
    prescription_trend: list[PrescriptionTrendPoint] = []
    rule_hit_rank: list[RuleHitRankItem] = []
    template_usage_rank: list[TemplateUsageRankItem] = []
    cluster_distribution: dict[str, int]
    reference_data_status: ReferenceDataStatus
