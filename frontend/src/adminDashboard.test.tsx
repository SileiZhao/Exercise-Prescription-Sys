import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/adminDashboard", () => ({
  getAdminDashboardSummary: vi.fn().mockResolvedValue({
    total_users: 12,
    users_by_role: { USER: 8, EXPERT: 2, ADMIN: 1, RESEARCHER: 1 },
    risk_distribution: { R1: 5, R2: 4, R3: 1 },
    prescription_status: { PUBLISHED: 6, PENDING_REVIEW: 3, REFERRED: 1 },
    review_stats: { pending: 3, approved: 5, rejected: 1, referred: 1 },
    r2_review_rate: 1,
    r3_referral_count: 1,
    feedback_stats: { total: 20, average_completion_rate: 82.5 },
    template_usage: { total_templates: 10, approved_templates: 7 },
    cluster_distribution: { 肥胖代谢风险型: 4, 心肺功能不足型: 3 }
  })
}));

describe("admin dashboard", () => {
  it("renders operational and safety statistics", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/admin/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("管理看板")).toBeInTheDocument();
    expect(screen.getByText("用户总数")).toBeInTheDocument();
    expect(screen.getByText("R2审核率")).toBeInTheDocument();
    expect(screen.getByText("R3转介量")).toBeInTheDocument();
    expect(screen.getByText("打卡完成率")).toBeInTheDocument();
    expect(screen.getByText("风险分布")).toBeInTheDocument();
    expect(screen.getByText("分型分布")).toBeInTheDocument();
  });
});
