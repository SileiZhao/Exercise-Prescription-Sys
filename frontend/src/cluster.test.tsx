import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockResolvedValue({
    current_risk_level: "R2",
    expert_review_status: "PENDING_REVIEW",
    today_can_exercise: false,
    today_block_reason: "专家审核通过前暂不开放训练入口",
    weekly_completion_rate: 0,
    current_stage_goals: [],
    recent_feedback: null,
    monitoring_reminders: [],
    prescription_id: null,
    prescription_version: null,
    next_reassessment_date: null,
    streak_days: 0,
    weekly_target_hits: 0,
    plan_completion_trend: [],
    abnormal_feedback_count: 0,
    review_status_label: "专家审核中",
    prescription_summary: null,
    risk_rule_hits: [
      {
        rule_id: "YELLOW_HYPERTENSION",
        rule_name: "YELLOW_HYPERTENSION",
        field_path: "risk_screening.has_hypertension",
        hit_value: true,
        threshold: "既往高血压或当前血压 >= 140/90",
        action_label: "提交专家审核",
        risk_level: "R2",
        explanation: "血压偏高，需专家审核后执行"
      }
    ]
  })
}));

describe("cluster pages", () => {
  it("renders user phenotype page", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/phenotype"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    const pageHeader = await screen.findByTestId("page-header-title-block");
    expect(within(pageHeader).getByText("人群分型")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成分型" })).toBeInTheDocument();
    expect(screen.getByText("分型结果只用于模板匹配，不覆盖风险规则。")).toBeInTheDocument();
    expect(screen.getByText("当前风险边界")).toBeInTheDocument();
  });

  it("renders the phenotype page as a decision report with R2 review action and rule hits", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/risk-result"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByTestId("risk-decision-report-card")).not.toBeNull());
    const pageHeader = screen.getByTestId("page-header-title-block");
    expect(within(pageHeader).getByText("判定报告")).toBeInTheDocument();
    expect(screen.getAllByText("判定报告").length).toBeGreaterThan(0);
    expect(screen.getByText("R2")).toBeInTheDocument();
    expect(screen.getAllByText("系统动作").length).toBeGreaterThan(0);
    expect(screen.getAllByText("提交专家审核").length).toBeGreaterThan(0);
    expect(screen.getByText("命中规则")).toBeInTheDocument();
    expect(screen.getByText("YELLOW_HYPERTENSION")).toBeInTheDocument();
    expect(screen.getByText("血压偏高，需专家审核后执行")).toBeInTheDocument();
    expect(screen.getByText("字段：risk_screening.has_hypertension")).toBeInTheDocument();
    expect(screen.getByText("命中值：是")).toBeInTheDocument();
    expect(screen.queryByText("当前后端未返回命中规则明细")).not.toBeInTheDocument();
    expect(screen.getByTestId("risk-result-action-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交专家审核" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成运动处方" })).not.toBeInTheDocument();
  });
});
