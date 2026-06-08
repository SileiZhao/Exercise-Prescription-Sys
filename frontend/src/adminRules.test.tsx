import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const createRiskRuleMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 2,
    code: "CUSTOM_YELLOW_PAIN",
    name: "疼痛黄色风险",
    severity: "YELLOW",
    priority: 20,
    rule_type: "RISK_LEVEL",
    source_ref: "运动风险规则库 v1",
    applies_to: ["adult", "chronic_disease"],
    review_status: "EXPERT_REVIEW_DRAFT",
    message: "疼痛评分达到黄色风险。",
    condition: { path: "fitness_test.pain_score", op: "gte", value: 4 },
    contraindications: ["避免跳跃"],
    intensity_cap: "低到中等强度",
    is_active: true,
    version: 1,
    created_by: 1,
    updated_by: 1,
    created_at: "2026-06-03T10:00:00",
    updated_at: "2026-06-03T10:00:00"
  })
);
const updateRiskRuleMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 1,
    code: "CUSTOM_RED_SBP",
    name: "更新后收缩压红色风险",
    severity: "RED",
    message: "收缩压达到红色风险。",
    condition: { path: "fitness_test.sbp", op: "gte", value: 175 },
    contraindications: ["禁止生成训练方案"],
    intensity_cap: "不生成训练处方",
    is_active: true,
    version: 2,
    created_by: 1,
    updated_by: 1,
    created_at: "2026-05-30T10:00:00",
    updated_at: "2026-06-03T10:00:00"
  })
);
const listAuditLogsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        id: 1,
        actor_id: 1,
        action: "UPDATE_RISK_RULE",
        resource_type: "RiskRuleConfig",
        resource_id: "CUSTOM_RED_SBP",
        metadata: { version: 2, is_active: true },
        created_at: "2026-06-03T10:00:00"
      }
    ]
  })
);

vi.mock("./api/adminRules", () => ({
  createRiskRule: createRiskRuleMock,
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
      priority: 10,
      rule_type: "RISK_LEVEL",
      source_ref: "测试规则表",
      applies_to: ["adult"],
      review_status: "EXPERT_REVIEW_DRAFT",
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
  }),
  updateRiskRule: updateRiskRuleMock
}));

vi.mock("./api/adminAudit", () => ({
  listAuditLogs: listAuditLogsMock
}));

describe("admin rules page", () => {
  beforeEach(() => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");
    createRiskRuleMock.mockClear();
  });

  it("renders configurable risk rules and rule test tool", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/rules"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("风险规则管理")).toBeInTheDocument();
    expect(screen.getByTestId("admin-rules-workbench")).toBeInTheDocument();
    expect(await screen.findByText("规则库概览")).toBeInTheDocument();
    expect(screen.getByText("筛选后 1 / 全部 1")).toBeInTheDocument();
    expect(screen.getByText("每页 12 条，详情在抽屉中查看")).toBeInTheDocument();
    expect(await screen.findByText("CUSTOM_RED_SBP")).toBeInTheDocument();
    expect(screen.getByText("自定义收缩压红色风险")).toBeInTheDocument();
    expect(screen.getByText("fitness_test.sbp gte 175")).toBeInTheDocument();
    expect(screen.queryByText(/"path"/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存规则" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行规则测试" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "运行规则测试" }));

    await waitFor(() => expect(screen.getByText("测试结果：R3")).toBeInTheDocument());
    expect(screen.getByText("命中规则")).toBeInTheDocument();
    expect(screen.getAllByText("CUSTOM_RED_SBP").length).toBeGreaterThan(0);
    expect(screen.getByText("字段：fitness_test.sbp")).toBeInTheDocument();
    expect(screen.queryByText(/"code"/)).not.toBeInTheDocument();
  });

  it("opens rule detail drawer with filters, edit, version history and audit logs", async () => {
    updateRiskRuleMock.mockClear();
    listAuditLogsMock.mockClear();

    render(
      <MemoryRouter initialEntries={["/admin/rules"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("自定义收缩压红色风险")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM_RED_SBP")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("规则筛选"), { target: { value: "收缩压" } });
    expect(screen.getByText("自定义收缩压红色风险")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看规则详情" }));
    expect(await screen.findByText("规则详情")).toBeInTheDocument();
    expect(screen.getByText("版本历史")).toBeInTheDocument();
    expect(screen.getByText("v1 · 启用")).toBeInTheDocument();
    expect(screen.getByText("审计日志")).toBeInTheDocument();
    expect(await screen.findByText("UPDATE_RISK_RULE")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("编辑规则名称"), { target: { value: "更新后收缩压红色风险" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则编辑" }));

    await waitFor(() =>
      expect(updateRiskRuleMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "更新后收缩压红色风险", is_active: true })
      )
    );
  });

  it("rejects invalid JSON values while editing an existing rule", async () => {
    updateRiskRuleMock.mockClear();
    listAuditLogsMock.mockClear();

    render(
      <MemoryRouter initialEntries={["/admin/rules"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("自定义收缩压红色风险")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看规则详情" }));
    expect(await screen.findByText("规则详情")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("编辑比较值"), { target: { value: "{bad-json" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则编辑" }));

    await waitFor(() => expect(screen.getByText("编辑比较值必须是合法 JSON。")).toBeInTheDocument());
    expect(updateRiskRuleMock).not.toHaveBeenCalled();
  });

  it("creates rules with audit metadata and rejects invalid JSON values before saving", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/rules"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("风险规则管理")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("规则编码"), { target: { value: "CUSTOM_YELLOW_PAIN" } });
    fireEvent.change(screen.getByLabelText("规则名称"), { target: { value: "疼痛黄色风险" } });
    fireEvent.change(screen.getByLabelText("优先级"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("规则类型"), { target: { value: "RISK_LEVEL" } });
    fireEvent.change(screen.getByLabelText("来源引用"), { target: { value: "运动风险规则库 v1" } });
    fireEvent.change(screen.getByLabelText("适用人群"), { target: { value: "adult，chronic_disease" } });
    fireEvent.change(screen.getByLabelText("审核状态"), { target: { value: "EXPERT_REVIEW_DRAFT" } });
    fireEvent.change(screen.getByLabelText("命中文案"), { target: { value: "疼痛评分达到黄色风险。" } });
    fireEvent.change(screen.getByLabelText("字段路径"), { target: { value: "fitness_test.pain_score" } });
    fireEvent.change(screen.getByLabelText("比较值"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("禁忌/动作限制"), { target: { value: "避免跳跃" } });
    fireEvent.change(screen.getByLabelText("强度上限"), { target: { value: "低到中等强度" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));

    await waitFor(() =>
      expect(createRiskRuleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "CUSTOM_YELLOW_PAIN",
          name: "疼痛黄色风险",
          priority: 20,
          rule_type: "RISK_LEVEL",
          source_ref: "运动风险规则库 v1",
          applies_to: ["adult", "chronic_disease"],
          review_status: "EXPERT_REVIEW_DRAFT",
          condition: { path: "fitness_test.pain_score", op: "gte", value: 4 }
        })
      )
    );

    createRiskRuleMock.mockClear();
    fireEvent.change(screen.getByLabelText("比较值"), { target: { value: "{bad-json" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));

    await waitFor(() => expect(screen.getByText("比较值必须是合法 JSON。")).toBeInTheDocument());
    expect(createRiskRuleMock).not.toHaveBeenCalled();
  });
});
