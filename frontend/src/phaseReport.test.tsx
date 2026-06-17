import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockResolvedValue({
    prescription_id: 10,
    weeks: 4,
    feedback_count: 3,
    average_completion_rate: 71.67,
    average_rpe: 8,
    pain_events: 2,
    discomfort_events: 1,
    red_alert_events: 0,
    decision: "REVIEW_REQUIRED",
    summary: "近4周共记录3次运动反馈，平均完成率71.67%，平均RPE 8，疼痛事件2次，不适事件1次。",
    measurement_changes: {},
    recommendations: ["疼痛或RPE偏高，进入专家复核"]
  })
}));

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

describe("phase report direct portal page", () => {
  it("renders phase summary metrics and recommendations in the replacement page", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/phase-report"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect((await screen.findAllByRole("heading", { name: "阶段评估报告" })).length).toBeGreaterThan(0);
    expect(await screen.findByText("近4周共记录3次运动反馈，平均完成率71.67%，平均RPE 8，疼痛事件2次，不适事件1次。")).toBeInTheDocument();
    expect(screen.getByText("平均完成率")).toBeInTheDocument();
    expect(screen.getByText("71.67%")).toBeInTheDocument();
    expect(screen.getByText("平均 RPE")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("复评建议")).toBeInTheDocument();
    expect(screen.getByText("疼痛或RPE偏高，进入专家复核")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "阶段报告" })).not.toBeInTheDocument();
  });
});
