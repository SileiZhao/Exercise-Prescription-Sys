import { apiClient } from "./client";

export type ResearchSummary = {
  total_participants: number;
  risk_distribution: Record<string, number>;
  cluster_distribution: Record<string, number>;
  cluster_risk_overlay?: Record<string, Record<string, number>>;
  prescription_status: Record<string, number>;
  template_effects?: Record<string, number>;
  export_job_status?: Record<string, number>;
  intervention_effects: {
    feedback_count: number;
    average_completion_rate: number;
    average_rpe: number;
    discomfort_event_count: number;
    pain_worsened_count: number;
    completion_rate_trend?: Array<{ date: string; value: number }>;
    rpe_trend?: Array<{ date: string; value: number }>;
    pain_trend?: Array<{ date: string; value: number }>;
    blood_pressure_trend?: Array<{ date: string; sbp?: number; dbp?: number }>;
    blood_glucose_trend?: Array<{ date: string; value: number }>;
  };
};

export type DesensitizedUserRow = {
  research_subject_id?: string;
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

export type ResearchExportFormat = "csv" | "xlsx" | "json";

export type ResearchExportRequest = {
  id: number;
  requested_by: number;
  organization_id?: number | null;
  format: ResearchExportFormat;
  purpose: string;
  status: string;
  approved_by: number | null;
  approval_comment: string | null;
  row_count: number;
  expires_at: string | null;
  downloaded_at: string | null;
  created_at: string;
};

export function getResearchSummary(): Promise<ResearchSummary> {
  return apiClient.get("/research/export/summary").then((response) => response.data);
}

export function exportDesensitizedUsers(): Promise<ResearchExportResponse> {
  return apiClient.get("/research/export/users").then((response) => response.data);
}

export function listResearchExportRequests(): Promise<ResearchExportRequest[]> {
  return apiClient.get("/research/export/requests").then((response) => response.data);
}

export function createResearchExportRequest(payload: { format: ResearchExportFormat; purpose: string }): Promise<ResearchExportRequest> {
  return apiClient.post("/research/export/requests", payload).then((response) => response.data);
}

export function approveResearchExportRequest(
  requestId: number,
  payload: { approval_comment: string }
): Promise<ResearchExportRequest> {
  return apiClient.post(`/research/export/requests/${requestId}/approve`, payload).then((response) => response.data);
}

export function rejectResearchExportRequest(
  requestId: number,
  payload: { approval_comment: string }
): Promise<ResearchExportRequest> {
  return apiClient.post(`/research/export/requests/${requestId}/reject`, payload).then((response) => response.data);
}

export function downloadResearchExportRequest(requestId: number): Promise<Blob> {
  return apiClient.get(`/research/export/requests/${requestId}/download`, { responseType: "blob" }).then((response) => response.data);
}
