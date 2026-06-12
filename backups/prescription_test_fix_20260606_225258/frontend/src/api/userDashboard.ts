import { apiClient } from "./client";

export interface RiskRuleHitSummary {
  rule_id?: string | number | null;
  rule_name?: string | null;
  name?: string | null;
  field_path?: string | null;
  path?: string | null;
  hit_value?: string | number | boolean | null;
  value?: string | number | boolean | null;
  threshold?: string | number | boolean | null;
  action?: string | null;
  action_label?: string | null;
  risk_level?: string | null;
  explanation?: string | null;
}

export interface UserDashboardSummary {
  current_risk_level: string | null;
  expert_review_status: string;
  today_can_exercise: boolean;
  today_block_reason: string | null;
  weekly_completion_rate: number;
  profile_completion_rate?: number | null;
  current_stage_goals: string[];
  recent_feedback: {
    exercise_date: string | null;
    exercise_type: string | null;
    rpe: number | null;
    pain_score_after: number | null;
    discomfort: string[];
    completion_rate: number | null;
  };
  monitoring_reminders: string[];
  prescription_id: number | null;
  prescription_version: number | null;
  next_reassessment_date: string | null;
  streak_days: number;
  weekly_target_hits: number;
  plan_completion_trend: number[];
  feedback_trend: Array<{
    date: string;
    rpe: number;
    pain: number | null;
    completion_rate: number;
  }>;
  health_radar: Array<{
    metric: string;
    value: number;
    max: number;
  }>;
  abnormal_feedback_count: number;
  review_status_label: string;
  prescription_summary: {
    cluster_label?: string | null;
    fitt_vp?: Record<string, unknown> | null;
    safety_notice?: string | null;
    reassessment?: string | null;
    contraindications?: string[];
  } | null;
  risk_rule_hits?: RiskRuleHitSummary[];
}

export function getUserDashboard() {
  return apiClient.get<UserDashboardSummary>("/user/dashboard").then((response) => response.data);
}
