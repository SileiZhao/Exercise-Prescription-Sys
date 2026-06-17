import { apiClient } from "./client";

export interface UserDashboardSummary {
  current_risk_level: string | null;
  expert_review_status: string;
  today_can_exercise: boolean;
  today_block_reason: string | null;
  weekly_completion_rate: number;
  current_stage_goals: string[];
  recent_feedback: {
    exercise_date: string | null;
    exercise_type: string | null;
    rpe: number | null;
    pain_score_after: number | null;
    discomfort: string[];
    completion_rate: number | null;
  } | null;
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
  } | null;
}

export function getUserDashboard() {
  return apiClient.get<UserDashboardSummary>("/user/dashboard").then((response) => response.data);
}
