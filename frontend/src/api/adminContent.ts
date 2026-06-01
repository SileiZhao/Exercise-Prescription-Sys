import { apiClient } from "./client";

export type AdminPayload = Record<string, unknown>;

export interface KnowledgeDocumentItem {
  id: number;
  title: string;
  category: string;
  source: string | null;
  status: string;
  chunk_count: number;
  created_at: string;
}

export interface KnowledgeDocumentList {
  total: number;
  items: KnowledgeDocumentItem[];
}

export interface KnowledgeEvidence {
  document_id: number;
  document_title: string;
  chunk_id: number;
  content: string;
  tags: string[];
  score: number;
  source_type?: string | null;
  version?: string | null;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
}

export interface ComplianceMaterial {
  id: number;
  code: string;
  title: string;
  version: string;
  effective_date: string | null;
  applicable_scope: string | null;
  text: string;
  short_notice: string | null;
  review_status: string;
  status: string;
}

export function createExerciseAction(payload: AdminPayload) {
  return apiClient.post("/admin/actions", payload).then((response) => response.data);
}

export function listExerciseActions() {
  return apiClient.get("/admin/actions").then((response) => response.data);
}

export function reviewExerciseAction(actionId: number, payload: AdminPayload) {
  return apiClient.post(`/admin/actions/${actionId}/review`, payload).then((response) => response.data);
}

export function createPrescriptionTemplate(payload: AdminPayload) {
  return apiClient.post("/admin/templates", payload).then((response) => response.data);
}

export function createKnowledgeDocument(payload: AdminPayload) {
  return apiClient.post("/admin/knowledge/documents", payload).then((response) => response.data);
}

export function listKnowledgeDocuments(params: AdminPayload = {}) {
  return apiClient.get<KnowledgeDocumentList>("/admin/knowledge/documents", { params }).then((response) => response.data);
}

export function updateKnowledgeDocument(documentId: number, payload: AdminPayload) {
  return apiClient.patch(`/admin/knowledge/documents/${documentId}`, payload).then((response) => response.data);
}

export function searchKnowledge(payload: AdminPayload) {
  return apiClient.post<KnowledgeEvidence[]>("/admin/knowledge/search", payload).then((response) => response.data);
}

export function reindexKnowledge() {
  return apiClient.post<{ indexed: number; skipped: number }>("/admin/knowledge/reindex").then((response) => response.data);
}

export function listComplianceMaterials() {
  return apiClient.get<ComplianceMaterial[]>("/admin/compliance/materials").then((response) => response.data);
}
