import { render, screen } from "@testing-library/react";
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

    expect(await screen.findByText("用户看板")).toBeInTheDocument();
    expect(screen.getByText("AI 运动处方")).toBeInTheDocument();
    expect(screen.getByText("当前为示范数据")).toBeInTheDocument();
    expect(await screen.findByText(/R2 风险 · 已发布 · 今日可运动/)).toBeInTheDocument();
    expect(screen.getByText("当前风险等级")).toBeInTheDocument();
    expect(screen.getByText("R2 专家审核中")).toBeInTheDocument();
    expect(screen.getByText("安全边界")).toBeInTheDocument();
    expect(screen.getByText(/审核通过后才展示训练入口/)).toBeInTheDocument();
    expect(screen.getByText("审核状态")).toBeInTheDocument();
    expect(screen.getByText("已发布")).toBeInTheDocument();
    expect(screen.getByText("今日可运动")).toBeInTheDocument();
    expect(screen.getByText("可运动")).toBeInTheDocument();
    expect(screen.getByText("本周完成率")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
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
    expect(screen.getByText("连续运动天数")).toBeInTheDocument();
    expect(screen.getByText("2 天")).toBeInTheDocument();
    expect(screen.getByText("异常反馈次数")).toBeInTheDocument();
    expect(screen.getByText("1 次")).toBeInTheDocument();
    expect(screen.getByText("FITT-VP 处方结构")).toBeInTheDocument();
    expect(screen.getByText("频率")).toBeInTheDocument();
    expect(screen.getByText("每周4次")).toBeInTheDocument();
    expect(screen.getByTestId("AdherenceChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("FeedbackTrendChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("HealthRadarChart-echart")).toBeInTheDocument();
    expect(screen.queryByText(/frequency/)).not.toBeInTheDocument();
  });

  it("locks R2 dashboard behind expert review when the prescription is not published", async () => {
    getUserDashboardMock.mockResolvedValueOnce({
      ...dashboardSummary,
      current_risk_level: "R2",
      today_can_exercise: false,
      review_status_label: "专家审核中",
      expert_review_status: "PENDING_REVIEW",
      today_block_reason: "R2 处方审核通过前不可开始训练",
      prescription_summary: { ...dashboardSummary.prescription_summary, fitt_vp: dashboardSummary.prescription_summary.fitt_vp }
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("今日不可运动")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看审核状态/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /进入今日任务/ })).not.toBeInTheDocument();
    expect(screen.getByText(/R2 审核通过前不展示训练动作/)).toBeInTheDocument();
  });

  it("shows only safety advice for R3 without FITT-VP training content", async () => {
    getUserDashboardMock.mockResolvedValueOnce({
      ...dashboardSummary,
      current_risk_level: "R3",
      today_can_exercise: false,
      review_status_label: "医学评估建议",
      expert_review_status: "REFERRED",
      today_block_reason: "R3 高风险仅展示医学评估与转介建议",
      prescription_summary: { ...dashboardSummary.prescription_summary, fitt_vp: null }
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("今日不可运动")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看安全建议/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /进入今日任务/ })).not.toBeInTheDocument();
    expect(screen.getByText(/仅显示医学评估建议/)).toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 处方结构")).not.toBeInTheDocument();
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

    expect(await screen.findByText("用户看板")).toBeInTheDocument();
    expect(await screen.findByTestId("FeedbackTrendChart-echart")).toBeInTheDocument();
    expect(await screen.findByTestId("HealthRadarChart-echart")).toBeInTheDocument();
  });
});
