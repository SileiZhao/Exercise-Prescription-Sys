import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/adminRules", () => ({
  createRiskRule: vi.fn(),
  listRiskRules: vi.fn().mockResolvedValue([
    {
      id: 1,
      code: "CUSTOM_RED_SBP",
      name: "自定义收缩压红色风险",
      severity: "RED",
      message: "收缩压达到红色风险。",
      condition: { path: "fitness_test.sbp", op: "gte", value: 175 },
      contraindications: ["禁止生成训练方案"],
      intensity_cap: "不生成训练处方",
      is_active: true,
      version: 1,
      created_by: 1,
      updated_by: 1,
      created_at: "2026-05-30T10:00:00",
      updated_at: "2026-05-30T10:00:00"
    }
  ]),
  testRiskRules: vi.fn().mockResolvedValue({
    risk_level: "R3",
    message: "当前存在高风险信号，不生成训练处方，建议医学评估或专业转介。",
    allow_ai_generation: false,
    allow_auto_publish: false,
    requires_expert_review: true,
    intensity_cap: "不生成训练强度",
    contraindications: ["禁止生成训练方案"],
    matched_rules: [{ code: "CUSTOM_RED_SBP", severity: "RED", message: "收缩压达到红色风险。", path: "fitness_test.sbp" }],
    source_snapshot: {}
  })
}));

describe("admin rules page", () => {
  it("renders configurable risk rules and rule test tool", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter initialEntries={["/admin/rules"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("风险规则管理")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM_RED_SBP")).toBeInTheDocument();
    expect(screen.getByText("自定义收缩压红色风险")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存规则" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行规则测试" })).toBeInTheDocument();
  });
});
