import { apiClient } from "./client";

export interface ReviewQueueItem {
  prescription_id: number;
  user_id: number;
  organization_id: number | null;
  risk_level: string;
  status: string;
  prescription_type: string;
  abnormal_feedback_count: number;
  version: number;
  created_at: string;
  review_id: number | null;
}

export interface ReviewQueueFilters {
  risk_level?: string;
  status?: string;
  organization_id?: number;
  prescription_type?: string;
  abnormal_feedback?: boolean;
  start_date?: string;
  end_date?: string;
}

export interface ReviewStats {
  average_review_hours: number;
  r2_pending_count: number;
  timeout_count: number;
}

export interface ReviewDetail {
  prescription: {
    id: number;
    risk_level: string;
    status: string;
    fitt_vp: Record<string, unknown> | null;
    precautions: string[];
    contraindications: string[];
    reassessment?: string;
    safety_notice?: string | null;
    evidence_refs: Array<Record<string, unknown>>;
  };
  review: {
    id: number;
    status: string;
    review_comment?: string | null;
    edited_prescription?: Record<string, unknown> | null;
  };
  health_snapshot: Record<string, Record<string, unknown> | null>;
  risk_rules: Array<Record<string, unknown>>;
  evidence_refs: Array<Record<string, unknown>>;
  template: Record<string, unknown> | null;
  candidate_actions: Array<Record<string, unknown>>;
  versions?: Array<Record<string, unknown>>;
  trends?: Record<string, unknown>;
}

export function listReviewQueue(filters: ReviewQueueFilters = {}) {
  return apiClient.get<ReviewQueueItem[]>("/expert-reviews", { params: filters }).then((response) => response.data);
}

export function getReviewStats() {
  return apiClient.get<ReviewStats>("/expert-reviews/stats").then((response) => response.data);
}

export function getReviewDetail(prescriptionId: number) {
  return apiClient.get<ReviewDetail>(`/expert-reviews/${prescriptionId}`).then((response) => response.data);
}

export function approvePrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/approve`, payload).then((response) => response.data);
}

export function startReview(prescriptionId: number) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/start`).then((response) => response.data);
}

export function rejectPrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/reject`, payload).then((response) => response.data);
}

export function referPrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/refer`, payload).then((response) => response.data);
}

export function requestMoreInformation(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/request-info`, payload).then((response) => response.data);
}

export function pausePrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/pause`, payload).then((response) => response.data);
}
