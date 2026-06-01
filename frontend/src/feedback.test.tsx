import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/feedback", () => ({
  adjustFeedback: vi.fn()
}));

vi.mock("./api/healthData", () => ({
  createExerciseFeedback: vi.fn()
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([
    {
      id: 10,
      risk_level: "R1",
      cluster_label: "初级运动水平",
      goals: ["增强心肺"],
      fitt_vp: { type: ["快走"], time: "每次30分钟" },
      precautions: ["监测RPE"],
      contraindications: [],
      reassessment: "4周复测",
      evidence_refs: [],
      safety_notice: null,
      status: "PUBLISHED",
      expert_review_required: false,
      version: 1,
      created_at: "2026-05-28T00:00:00"
    }
  ]),
  generatePrescription: vi.fn()
}));

describe("today exercise feedback page", () => {
  it("renders workout check-in and dynamic adjustment controls", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("今日运动")).toBeInTheDocument();
    expect(screen.getByText("运动打卡")).toBeInTheDocument();
    expect(screen.getByText("我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号")).toBeInTheDocument();
    expect(screen.getByLabelText("RPE")).toBeInTheDocument();
    expect(screen.getByLabelText("疼痛评分")).toBeInTheDocument();
    expect(screen.getByText("不适反应")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交打卡并动态调整" })).toBeInTheDocument();
  });
});
