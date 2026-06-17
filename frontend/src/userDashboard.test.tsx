import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const getUserDashboardMock = vi.hoisted(() => vi.fn());

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: getUserDashboardMock
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("no phase"))
}));

const dashboardSummary = {
  current_risk_level: "R1",
  expert_review_status: "PUBLISHED",
  today_can_exercise: true,
  today_block_reason: null,
  weekly_completion_rate: 65,
  current_stage_goals: ["体重管理", "改善血压"],
  recent_feedback: null,
  monitoring_reminders: [],
  prescription_id: 10,
  prescription_version: 3,
  next_reassessment_date: "2026-06-30",
  streak_days: 2,
  weekly_target_hits: 2,
  plan_completion_trend: [50, 80, 100, 0, 0, 0, 0],
  feedback_trend: [],
  health_radar: [],
  abnormal_feedback_count: 1,
  review_status_label: "已发布",
  prescription_summary: {
    cluster_label: "血压关注 + 体重管理",
    fitt_vp: {
      frequency: "每周4次",
      intensity: "低-中强度",
      time: "每次30分钟",
      type: ["快走", "拉伸"],
      volume: "每周120分钟",
      progression: "2周后依据RPE进阶"
    },
    safety_notice: "R2 已审核发布，可按低强度起步。",
    reassessment: "4周复评"
  }
};

describe("user dashboard direct portal", () => {
  beforeEach(() => {
    getUserDashboardMock.mockResolvedValue(dashboardSummary);
  });

  it("renders the user-pages dashboard layout directly", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "工作台首页" })).toBeInTheDocument();
    expect(screen.getByText("用户门户 (USER)")).toBeInTheDocument();
    expect(screen.getByText("今日可进行运动")).toBeInTheDocument();
    expect(screen.getByText("当前执行处方")).toBeInTheDocument();
    expect(screen.getByText("阶段复评倒计时")).toBeInTheDocument();
    expect(screen.getByText("本周完成率")).toBeInTheDocument();
    expect(screen.getByText("健康画像")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "今日通行证" })).not.toBeInTheDocument();
  });
});
