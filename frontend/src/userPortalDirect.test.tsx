import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ revoked: true }));

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return {
    ...actual,
    logout: logoutMock
  };
});

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockResolvedValue({
    current_risk_level: "R1",
    expert_review_status: "PUBLISHED",
    today_can_exercise: true,
    today_block_reason: null,
    weekly_completion_rate: 80,
    current_stage_goals: ["改善心肺"],
    recent_feedback: null,
    monitoring_reminders: [],
    prescription_id: 10,
    prescription_version: 2,
    next_reassessment_date: "2026-06-28",
    streak_days: 3,
    weekly_target_hits: 3,
    plan_completion_trend: [60, 80, 100],
    feedback_trend: [],
    health_radar: [],
    abnormal_feedback_count: 0,
    review_status_label: "已发布",
    prescription_summary: {
      cluster_label: "代谢风险",
      fitt_vp: {
        frequency: "每周 3 次",
        intensity: "中低强度 (RPE 4-6)",
        time: "每次 30-40 分钟",
        type: ["24式太极拳"],
        volume: "每周累计约 120 分钟",
        progression: "每两周根据心率微调"
      },
      safety_notice: "避免高冲击跳跃动作。",
      reassessment: "4周复评"
    }
  })
}));

describe("direct user portal replacement", () => {
  beforeEach(() => {
    localStorage.clear();
    logoutMock.mockClear();
  });

  it("renders the user-pages portal shell instead of the old user workbench shell", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("refresh_token", "refresh-token");
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
    expect(screen.queryByRole("heading", { name: "今日通行证" })).not.toBeInTheDocument();
  });

  it("logs out from the user portal shell", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("refresh_token", "refresh-token");
    localStorage.setItem("current_user_role", "USER");
    localStorage.setItem("current_user_id", "6");

    render(
      <MemoryRouter
        initialEntries={["/user/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "工作台首页" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledWith("refresh-token"));
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(localStorage.getItem("current_user_role")).toBeNull();
    expect(localStorage.getItem("current_user_id")).toBeNull();
  });
});
