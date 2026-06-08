import { apiClient } from "./client";

export interface FeedbackAdjustment {
  action: "RED_ALERT" | "REVIEW_REQUIRED" | "DEGRADE" | "PROGRESS" | "MAINTAIN";
  reasons: string[];
  new_prescription_id: number | null;
  version_id: number | null;
}

export interface MeasurementChangeValue {
  before?: number | string | null;
  after?: number | string | null;
  delta?: number | null;
  value?: null;
  null_reason?: string;
}

export interface PhaseAssessment {
  prescription_id: number | null;
  weeks: number;
  feedback_count: number;
  average_completion_rate: number;
  average_rpe: number;
  pain_events: number;
  discomfort_events: number;
  red_alert_events: number;
  decision: "NO_DATA" | "RED_ALERT" | "REVIEW_REQUIRED" | "DEGRADE" | "PROGRESS" | "MAINTAIN";
  summary: string;
  measurement_changes: Record<string, Record<string, MeasurementChangeValue>>;
  recommendations: string[];
}

export function adjustFeedback(feedbackId: number) {
  return apiClient.post<FeedbackAdjustment>(`/feedback/${feedbackId}/adjust`).then((response) => response.data);
}

export function getPhaseAssessment(weeks = 4) {
  return apiClient
    .get<PhaseAssessment>("/feedback/phase-assessment", { params: { weeks } })
    .then((response) => response.data);
}

export function exportPhaseAssessmentReport(weeks = 4) {
  return apiClient
    .get<Blob>("/reports/phase-assessment.docx", { params: { weeks }, responseType: "blob" })
    .then((response) => response.data);
}

export function exportPhaseAssessmentPdfReport(weeks = 4) {
  return apiClient
    .get<Blob>("/reports/phase-assessment.pdf", { params: { weeks }, responseType: "blob" })
    .then((response) => response.data);
}
