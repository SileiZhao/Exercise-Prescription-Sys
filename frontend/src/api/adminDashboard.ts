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
  cluster_distribution: Record<string, number>;
}

export function getAdminDashboardSummary() {
  return apiClient.get<AdminDashboardSummary>("/admin/dashboard/summary").then((response) => response.data);
}
