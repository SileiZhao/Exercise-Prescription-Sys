import type { AuditLogItem } from "../../../api/adminAudit";
import type { AdminPayload } from "../../../api/adminContent";
import { formatStatusLabel, sanitizeDisplayText } from "../../../components/ProductUI";
import type { ExerciseAction, KnowledgeEvidence, PrescriptionTemplate } from "./adminTemplateTypes";

export const riskOptions = ["R0", "R1", "R2", "R3"].map((value) => ({ value, label: value }));
export const categoryOptions = ["有氧", "抗阻", "柔韧", "平衡", "传统功法", "康复训练"].map((value) => ({ value, label: value }));
export const actionStatusLabels: Record<ExerciseAction["status"], string> = {
  APPROVED: "已批准",
  PENDING_REVIEW: "待审核",
  REJECTED: "已驳回"
};
export const complianceStatusLabels: Record<string, string> = {
  CONFIRMED: "已确认",
  DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW: "待确认"
};
export const platformStatusLabels: Record<string, string> = {
  APPROVED: "已批准",
  EXPERT_CONFIRMED: "专家已确认",
  CONFIRMED: "已确认",
  ACTIVE: "已启用",
  ARCHIVED: "已归档",
  DRAFT: "待平台确认",
  INDEX_FAILED: "索引失败"
};
export const retrievalModeLabels: Record<KnowledgeEvidence["retrieval_mode"], string> = {
  vector: "向量召回",
  keyword: "关键词召回",
  keyword_fallback: "关键词降级"
};

export function splitTags(value?: string): string[] {
  return value
    ? value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function parseJson(value: string | undefined, fallback: AdminPayload) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as AdminPayload;
  } catch {
    return fallback;
  }
}

export function platformStatus(status?: string | null) {
  return platformStatusLabels[String(status ?? "")] ?? formatStatusLabel(status, "general");
}

export function joinTags(tags?: string[]) {
  return tags?.length ? tags.join("，") : "";
}

export function displayText(value?: unknown) {
  return sanitizeDisplayText(value ?? "-") || "-";
}

export function displayTags(tags?: string[]) {
  return tags?.length ? tags.map((tag) => sanitizeDisplayText(tag)).join("，") : "";
}

export function auditItemText(log: AuditLogItem) {
  return sanitizeDisplayText(log.action);
}

export function governancePayload(values: AdminPayload): AdminPayload {
  const fitt = {
    frequency: values.fitt_frequency ?? "每周3次",
    intensity: values.fitt_intensity ?? "低到中等强度",
    time: values.fitt_time ?? "每次30分钟",
    type: splitTags(values.fitt_type as string),
    volume: values.fitt_volume ?? "每周90分钟",
    progression: values.fitt_progression ?? "每2-4周根据反馈调整"
  };
  return {
    name: values.name,
    risk_level: values.risk_level,
    cluster_tags: values.cluster_tags,
    goal_tags: values.goal_tags,
    fitt_vp: JSON.stringify(fitt),
    precautions: values.precautions,
    contraindications: values.contraindications,
    evidence_refs: values.evidence_refs,
    status: values.status,
    review_status: values.review_status,
    version: values.version,
    source_version: values.source_version
  };
}

export function fittValue(template: PrescriptionTemplate | null | undefined, key: string, fallback = "") {
  const value = template?.fitt_vp?.[key];
  if (Array.isArray(value)) return value.join("，");
  return value === null || value === undefined ? fallback : String(value);
}

export function templateInitialValues(template?: PrescriptionTemplate | null): AdminPayload {
  return {
    name: template?.name ?? "",
    risk_level: template?.risk_level ?? "R1",
    cluster_tags: joinTags(template?.cluster_tags),
    goal_tags: joinTags(template?.goal_tags),
    fitt_frequency: fittValue(template, "frequency", "每周3次"),
    fitt_intensity: fittValue(template, "intensity", "低到中等强度"),
    fitt_time: fittValue(template, "time", "每次30分钟"),
    fitt_type: fittValue(template, "type", "快走"),
    fitt_volume: fittValue(template, "volume", "每周90分钟"),
    fitt_progression: fittValue(template, "progression", "每2-4周根据反馈调整"),
    precautions: joinTags(template?.precautions),
    contraindications: joinTags(template?.contraindications),
    evidence_refs: joinTags(template?.evidence_refs),
    status: template?.status ?? "DRAFT",
    review_status: template?.review_status ?? "EXPERT_REVIEW_DRAFT",
    version: template?.version ?? 1,
    source_version: template?.source_version ?? ""
  };
}
