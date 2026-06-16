import { render, screen } from "@testing-library/react";
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
    prescription_summary: null
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

    expect(await screen.findByRole("heading", { name: "风险结果" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "查看审核状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新评估" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成分型" })).not.toBeInTheDocument();
    expect(screen.getByText("审核通过前不开放训练入口")).toBeInTheDocument();
    expect(screen.getByText("分型结果只用于模板匹配，不覆盖风险规则。")).toBeInTheDocument();
    expect(screen.getByText("当前风险边界")).toBeInTheDocument();
  });
});
