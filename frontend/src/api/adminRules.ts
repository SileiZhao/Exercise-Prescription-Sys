import { apiClient } from "./client";

export type RiskRulePayload = Record<string, unknown>;

export type RiskRuleItem = {
  id: number;
  code: string;
  name: string;
  severity: "GREEN" | "YELLOW" | "RED";
  priority?: number;
  rule_type?: string;
  source_ref?: string | null;
  applies_to?: string[];
  review_status?: string;
  message: string;
  condition: Record<string, unknown>;
  contraindications: string[];
  intensity_cap: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export function listRiskRules(): Promise<RiskRuleItem[]> {
  return apiClient.get("/admin/rules").then((response) => response.data);
}

export function createRiskRule(payload: RiskRulePayload) {
  return apiClient.post("/admin/rules", payload).then((response) => response.data);
}

export function updateRiskRule(ruleId: number, payload: RiskRulePayload) {
  return apiClient.patch(`/admin/rules/${ruleId}`, payload).then((response) => response.data);
}

export function testRiskRules(payload: RiskRulePayload) {
  return apiClient.post("/admin/rules/test", payload).then((response) => response.data);
}
