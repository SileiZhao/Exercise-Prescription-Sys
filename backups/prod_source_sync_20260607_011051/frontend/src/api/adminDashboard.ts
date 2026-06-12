import { apiClient } from "./client";

export interface AdminDashboardSummary {
  total_users: number;
  users_by_role: Record<string, number>;
  risk_distribution: Record<string, number>;
  prescription_status: Record<string, number>;
  review_stats: Record<string, number>;
  r2_review_rate: number;
  r3_referral_count: number;
  feedback_stats: {
    total: number;
    average_completion_rate: number;
  };
  template_usage: {
    total_templates: number;
    approved_templates: number;
  };
  prescription_trend: Array<{
    date: string;
    generated: number;
    published: number;
  }>;
  rule_hit_rank: Array<{
    rule: string;
    count: number;
  }>;
  template_usage_rank: Array<{
    template: string;
    count: number;
  }>;
  cluster_distribution: Record<string, number>;
  reference_data_status: {
    risk_rules: {
      total: number;
      active: number;
    };
    actions: {
      approved: number;
      pending_review: number;
    };
    approved_actions_count: number;
    pending_actions_count: number;
    compliance: {
      confirmed: number;
      draft: number;
    };
    confirmed_compliance_count: number;
    draft_compliance_count: number;
    templates: {
      total: number;
      approved: number;
    };
    knowledge: {
      documents: number;
      skipped_documents: number;
      chunks: number;
      indexed_chunks: number;
    };
    rag_active_documents_count: number;
    rag_skipped_documents_count: number;
    llm: {
      provider: string;
      model?: string | null;
      production_ready: boolean;
      status?: string | null;
    };
    embedding: {
      provider: string;
      model?: string | null;
      production_ready?: boolean | null;
      status?: string | null;
    };
    ocr: {
      provider: string;
      enabled?: boolean | null;
      status?: string | null;
    };
    embedding_provider: string;
    ocr_enabled: boolean;
    llm_provider: string;
    ollama_ready: boolean;
  };
}

export function getAdminDashboardSummary() {
  return apiClient.get<AdminDashboardSummary>("/admin/dashboard/summary").then((response) => response.data);
}
