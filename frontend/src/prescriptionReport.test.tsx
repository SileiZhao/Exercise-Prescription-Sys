import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([
    {
      id: 8,
      risk_level: "R1",
      cluster_label: "心肺功能不足型",
      goals: ["增强心肺"],
      fitt_vp: {
        frequency: "每周4次",
        intensity: "低-中等强度",
        time: "每次30分钟",
        type: ["快走"],
        volume: "每周120分钟",
        progression: "每2周调整"
      },
      precautions: ["监测RPE"],
      contraindications: ["高强度冲刺"],
      reassessment: "4周小评估",
      evidence_refs: [],
      safety_notice: null,
      status: "PUBLISHED",
      expert_review_required: false,
      version: 1,
      created_at: "2026-05-29T00:00:00"
    }
  ])
}));

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("not needed"))
}));

describe("prescription report entry in direct portal", () => {
  it("keeps the simplified PDF export entry without the old report history workbench", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/prescriptions"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("个性化运动处方")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    expect(screen.queryByText("最近导出记录")).not.toBeInTheDocument();
  });
});
