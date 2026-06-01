import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/researchExport", () => ({
  getResearchSummary: vi.fn().mockResolvedValue({
    total_participants: 2,
    risk_distribution: { R1: 1, R2: 1 },
    cluster_distribution: { 肥胖代谢风险型: 1, 心肺功能不足型: 1 },
    prescription_status: { PUBLISHED: 1, PENDING_REVIEW: 1 },
    intervention_effects: {
      feedback_count: 4,
      average_completion_rate: 86.5,
      average_rpe: 12.25,
      discomfort_event_count: 1,
      pain_worsened_count: 0
    }
  }),
  exportDesensitizedUsers: vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        participant_code: "P000001",
        profile: { age: 36, sex: "男", bmi: 28.37, exercise_goal: ["减脂"] },
        fitness_test: { sbp: 128, dbp: 82, pain_score: 1 },
        risk_screening: { risk_level: "R1", risk_reasons: ["超重"] },
        latest_prescription: { status: "PUBLISHED", cluster_label: "肥胖代谢风险型" }
      }
    ]
  })
}));

describe("research export page", () => {
  it("renders desensitized export and intervention statistics", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter initialEntries={["/research/export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("科研脱敏导出")).toBeInTheDocument();
    expect(screen.getByText("脱敏样本量")).toBeInTheDocument();
    expect(screen.getByText("平均完成率")).toBeInTheDocument();
    expect(screen.getByText("分型统计")).toBeInTheDocument();
    expect(screen.getByText("干预效果")).toBeInTheDocument();
    expect(screen.getByText("P000001")).toBeInTheDocument();
    expect(screen.queryByText("真实姓名")).not.toBeInTheDocument();
  });
});
