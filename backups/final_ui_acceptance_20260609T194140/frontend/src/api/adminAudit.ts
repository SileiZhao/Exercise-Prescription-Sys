import { apiClient } from "./client";

export interface AuditLogItem {
  id: number;
  actor_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogList {
  total: number;
  items: AuditLogItem[];
}

export function listAuditLogs(params: Record<string, unknown> = {}) {
  return apiClient.get<AuditLogList>("/admin/audit-logs", { params: { limit: 50, ...params } }).then((response) => response.data);
}
