import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const exportPhaseAssessmentReport = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["docx"])));
const exportPhaseAssessmentPdfReport = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["pdf"])));

vi.mock("./api/feedback", () => ({
  exportPhaseAssessmentReport,
  exportPhaseAssessmentPdfReport,
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
    recommendations: ["疼痛或RPE偏高，进入专家复核"]
  })
}));

describe("phase report page", () => {
  it("renders phase assessment metrics and recommendations", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/user/phase-report"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("阶段报告")).toBeInTheDocument();
    expect(screen.getByText("近4周共记录3次运动反馈，平均完成率71.67%，平均RPE 8，疼痛事件2次，不适事件1次。")).toBeInTheDocument();
    expect(screen.getByText("71.67%")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2次")).toBeInTheDocument();
    expect(screen.getByText("疼痛或RPE偏高，进入专家复核")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出阶段报告 Word" }));
    await waitFor(() => expect(exportPhaseAssessmentReport).toHaveBeenCalledWith(4));
    fireEvent.click(screen.getByRole("button", { name: "导出阶段报告 PDF" }));
    await waitFor(() => expect(exportPhaseAssessmentPdfReport).toHaveBeenCalledWith(4));
  });
});
