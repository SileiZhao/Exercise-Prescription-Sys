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
    feedback_trend: [],
    health_radar: [],
    abnormal_feedback_count: 0,
    review_status_label: "专家审核中",
    prescription_summary: null
  })
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("not needed"))
}));

describe("risk result direct portal page", () => {
  it("renders the user-pages risk result report", async () => {
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

    expect(await screen.findByRole("heading", { name: "风险评估结果" })).toBeInTheDocument();
    expect(screen.getByText("评估结果：R2 中风险干预型")).toBeInTheDocument();
    expect(screen.getByText("触发规则与评判依据")).toBeInTheDocument();
    expect(screen.getByText("辅助人群分型标签")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "风险结果" })).not.toBeInTheDocument();
  });
});
