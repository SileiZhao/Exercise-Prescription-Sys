import type { AdminPayload } from "../../../api/adminContent";

export type ExerciseAction = {
  id: number;
  source?: string | null;
  source_exercise_id?: string | null;
  name: string;
  name_en?: string | null;
  category: string;
  exercise_type?: string | null;
  image_url?: string | null;
  joint_stress_level?: string | null;
  impact_level?: string | null;
  requires_equipment?: boolean;
  is_traditional_exercise?: boolean;
  risk_level: string;
  intensity: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  suitable_tags?: string[];
  contraindication_tags?: string[];
  body_parts?: string[];
  stop_signals?: string[];
  evidence_refs?: string[];
};

export type KnowledgeDocument = {
  id: number;
  title: string;
  category: string;
  source: string | null;
  file_path?: string | null;
  source_type?: string | null;
  version?: string | null;
  published_year?: string | null;
  import_batch_id?: string | null;
  credibility_level?: string | null;
  skipped_reason?: string | null;
  status: string;
  chunk_count: number;
  created_at: string;
};

export type PrescriptionTemplate = {
  id: number;
  template_code?: string | null;
  name: string;
  risk_level: string;
  cluster_tags?: string[];
  goal_tags?: string[];
  fitt_vp?: AdminPayload | null;
  precautions?: string[];
  contraindications?: string[];
  evidence_refs?: string[];
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  version: number;
  source_version?: string | null;
  review_status?: string;
};

export type KnowledgeEvidence = {
  document_id: number;
  document_title: string;
  chunk_id: number;
  content: string;
  tags: string[];
  score: number;
  retrieval_mode: "vector" | "keyword" | "keyword_fallback";
  fallback_reason?: string | null;
  document_status: string;
  document_skipped_reason?: string | null;
  source_type?: string | null;
  version?: string | null;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  credibility_level?: string | null;
};
