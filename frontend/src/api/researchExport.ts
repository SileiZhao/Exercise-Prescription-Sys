import { apiClient } from "./client";

export type ResearchSummary = {
  total_participants: number;
  risk_distribution: Record<string, number>;
  cluster_distribution: Record<string, number>;
  prescription_status: Record<string, number>;
  intervention_effects: {
    feedback_count: number;
    average_completion_rate: number;
    average_rpe: number;
    discomfort_event_count: number;
    pain_worsened_count: number;
  };
};

export type DesensitizedUserRow = {
  participant_code: string;
  profile: Record<string, unknown>;
  fitness_test: Record<string, unknown> | null;
  risk_screening: Record<string, unknown> | null;
  latest_prescription: Record<string, unknown> | null;
};

export type ResearchExportResponse = {
  items: DesensitizedUserRow[];
  total: number;
};

export function getResearchSummary(): Promise<ResearchSummary> {
  return apiClient.get("/research/export/summary").then((response) => response.data);
}

export function exportDesensitizedUsers(): Promise<ResearchExportResponse> {
  return apiClient.get("/research/export/users").then((response) => response.data);
}
