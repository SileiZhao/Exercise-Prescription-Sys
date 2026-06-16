import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const getUserDashboardMock = vi.hoisted(() => vi.fn());

const dashboardSummary = {
  current_risk_level: "R2",
  expert_review_status: "PUBLISHED",
  today_can_exercise: true,
  today_block_reason: null,
  weekly_completion_rate: 65,
  current_stage_goals: ["体重管理", "改善血压"],
  recent_feedback: {
    exercise_date: "2026-06-02",
    exercise_type: "快走",
    rpe: 6,
    pain_score_after: 1,
    discomfort: [],
    completion_rate: 80
  },
  monitoring_reminders: ["血压监测提醒", "血糖监测提醒"],
  prescription_id: 10,
  prescription_version: 3,
  next_reassessment_date: "2026-06-30",
  streak_days: 2,
  weekly_target_hits: 2,
  plan_completion_trend: [50, 80],
  feedback_trend: [
    { date: "2026-06-01", rpe: 12, pain: 2, completion_rate: 50 },
    { date: "2026-06-02", rpe: 6, pain: 1, completion_rate: 80 }
  ],
  health_radar: [
    { metric: "BMI", value: 26.4, max: 40 },
    { metric: "收缩压", value: 146, max: 180 },
    { metric: "体脂率", value: 31.5, max: 45 }
  ],
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

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: getUserDashboardMock
}));

vi.mock("./api/healthData", () => ({
  getHealthSnapshot: vi.fn().mockRejectedValue(new Error("no snapshot"))
}));

describe("user dashboard", () => {
  beforeEach(() => {
    getUserDashboardMock.mockResolvedValue(dashboardSummary);
  });

  it("renders current risk, prescription, feedback and operation metrics", async () => {
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

    expect(await screen.findByRole("heading", { name: "今日通行证" })).toBeInTheDocument();
    expect(screen.getAllByText("启衡").length).toBeGreaterThan(0);
    expect(await screen.findByText(/当前状态为 R2，审核状态为 已发布/)).toBeInTheDocument();
    expect(screen.getByText("安全状态")).toBeInTheDocument();
    expect(screen.getAllByText("R2 专家审核中").length).toBeGreaterThan(0);
    expect(screen.getByText("安全边界")).toBeInTheDocument();
    expect(screen.getByText(/审核通过后才展示训练入口/)).toBeInTheDocument();
    expect(screen.getByText("专家审核状态")).toBeInTheDocument();
    expect(screen.getAllByText("已发布").length).toBeGreaterThan(0);
    expect(screen.getByText("今日可运动")).toBeInTheDocument();
    expect(screen.getAllByText("可运动").length).toBeGreaterThan(0);
    expect(screen.getByText("执行状态")).toBeInTheDocument();
    expect(screen.getByText(/本周完成率 65%/)).toBeInTheDocument();
    expect(screen.getByText("体重管理 / 改善血压")).toBeInTheDocument();
    expect(screen.getByText("最新反馈预警")).toBeInTheDocument();
    expect(screen.getByText("6 / 1")).toBeInTheDocument();
    expect(screen.getByText(/异常反馈 1 次/)).toBeInTheDocument();
    expect(screen.getByText("血压监测提醒")).toBeInTheDocument();
    expect(screen.getByText("血糖监测提醒")).toBeInTheDocument();
    expect(screen.getByText("处方版本")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("下次复评")).toBeInTheDocument();
    expect(screen.getByText("2026-06-30")).toBeInTheDocument();
    expect(screen.getByText("连续运动")).toBeInTheDocument();
    expect(screen.getByText("2 天")).toBeInTheDocument();
    expect(screen.getByText("异常反馈")).toBeInTheDocument();
    expect(screen.getAllByText("1 次").length).toBeGreaterThan(0);
    expect(screen.getByText("FITT-VP 处方结构")).toBeInTheDocument();
    expect(screen.getByText("频率")).toBeInTheDocument();
    expect(screen.getByText("每周4次")).toBeInTheDocument();
    fireEvent.click(screen.getByText("计划完成趋势"));
    expect(screen.getByTestId("AdherenceChart-echart")).toBeInTheDocument();
    fireEvent.click(screen.getByText("反馈趋势"));
    expect(screen.getByTestId("FeedbackTrendChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("HealthRadarChart-echart")).toBeInTheDocument();
    expect(screen.queryByText(/frequency/)).not.toBeInTheDocument();
  });

  it("uses real summary fields as chart fallback when the API omits trend arrays", async () => {
    getUserDashboardMock.mockResolvedValueOnce({
      ...dashboardSummary,
      feedback_trend: undefined,
      health_radar: undefined
    });
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

    expect(await screen.findByRole("heading", { name: "今日通行证" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("反馈趋势"));
    expect(screen.getByTestId("FeedbackTrendChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("HealthRadarChart-echart")).toBeInTheDocument();
  });

  it("routes R3 users to medical evaluation advice instead of prescription or training actions", async () => {
    getUserDashboardMock.mockResolvedValueOnce({
      ...dashboardSummary,
      current_risk_level: "R3",
      expert_review_status: "REFERRED",
      today_can_exercise: false,
      today_block_reason: "R3 建议医学评估，训练入口已锁定",
      review_status_label: "医学评估建议",
      prescription_summary: null
    });
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

    expect(await screen.findByRole("heading", { name: "今日通行证" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看医学评估建议/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /进入运动前安全闸门/ })).not.toBeInTheDocument();
  });
});
