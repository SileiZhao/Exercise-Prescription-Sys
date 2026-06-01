import { apiClient } from "./client";

export interface ReviewQueueItem {
  prescription_id: number;
  user_id: number;
  risk_level: string;
  status: string;
  version: number;
  created_at: string;
  review_id: number | null;
}

export interface ReviewDetail {
  prescription: {
    id: number;
    risk_level: string;
    status: string;
    fitt_vp: Record<string, unknown> | null;
    precautions: string[];
    contraindications: string[];
    evidence_refs: Array<Record<string, unknown>>;
  };
  review: { id: number; status: string };
  health_snapshot: Record<string, Record<string, unknown> | null>;
  risk_rules: Array<Record<string, unknown>>;
  evidence_refs: Array<Record<string, unknown>>;
  template: Record<string, unknown> | null;
  candidate_actions: Array<Record<string, unknown>>;
}

export function listReviewQueue() {
  return apiClient.get<ReviewQueueItem[]>("/expert-reviews").then((response) => response.data);
}

export function getReviewDetail(prescriptionId: number) {
  return apiClient.get<ReviewDetail>(`/expert-reviews/${prescriptionId}`).then((response) => response.data);
}

export function approvePrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/approve`, payload).then((response) => response.data);
}

export function rejectPrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/reject`, payload).then((response) => response.data);
}

export function referPrescription(prescriptionId: number, payload: Record<string, unknown>) {
  return apiClient.post(`/expert-reviews/${prescriptionId}/refer`, payload).then((response) => response.data);
}
