import { apiClient } from "./client";

export interface PrescriptionRecord {
  id: number;
  risk_level: string;
  cluster_label: string | null;
  goals: string[];
  fitt_vp: Record<string, unknown> | null;
  precautions: string[];
  contraindications: string[];
  reassessment: string;
  evidence_refs: Array<Record<string, unknown>>;
  safety_notice: string | null;
  status: string;
  expert_review_required: boolean;
  version: number;
  created_at: string;
}

export interface ReportExportRecord {
  id: number;
  user_id: number;
  exported_by: number;
  prescription_id: number | null;
  report_type: string;
  format: string;
  filename: string;
  risk_level: string | null;
  status: string | null;
  version: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReportExportRecordList {
  total: number;
  items: ReportExportRecord[];
}

export function generatePrescription() {
  return apiClient.post<PrescriptionRecord>("/prescriptions/generate").then((response) => response.data);
}

export function listMyPrescriptions() {
  return apiClient.get<PrescriptionRecord[]>("/prescriptions/me").then((response) => response.data);
}

export function exportPrescriptionReport(prescriptionId: number) {
  return apiClient
    .get<Blob>(`/reports/prescriptions/${prescriptionId}.docx`, { responseType: "blob" })
    .then((response) => response.data);
}

export function exportPrescriptionPdfReport(prescriptionId: number) {
  return apiClient
    .get<Blob>(`/reports/prescriptions/${prescriptionId}.pdf`, { responseType: "blob" })
    .then((response) => response.data);
}

export function listReportExportRecords() {
  return apiClient.get<ReportExportRecordList>("/reports/exports").then((response) => response.data);
}
