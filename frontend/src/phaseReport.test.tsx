import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { exportPhaseAssessmentPdfReport } from "./api/feedback";

vi.mock("./api/feedback", () => ({
  adjustFeedback: vi.fn().mockResolvedValue({ action: "MAINTAIN", reasons: [], new_prescription_id: null, version_id: null }),
  exportPhaseAssessmentPdfReport: vi.fn().mockResolvedValue(new Blob(["phase-pdf"], { type: "application/pdf" })),
  exportPhaseAssessmentReport: vi.fn().mockResolvedValue(new Blob(["phase-docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
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
  exportPrescriptionPdfReport: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  exportPrescriptionReport: vi.fn().mockResolvedValue(new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  generatePrescription: vi.fn().mockResolvedValue({ id: 10 }),
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

vi.mock("./api/healthData", () => ({
  acceptConsent: vi.fn().mockResolvedValue({ id: 1 }),
  upsertProfile: vi.fn().mockResolvedValue({ id: 2 }),
  createFitnessTest: vi.fn().mockResolvedValue({ id: 3 }),
  createBodyComposition: vi.fn().mockResolvedValue({ id: 4 }),
  createBiochemicalIndex: vi.fn().mockResolvedValue({ id: 5 }),
  createRiskScreening: vi.fn().mockResolvedValue({ id: 6 }),
  createExerciseFeedback: vi.fn().mockResolvedValue({ id: 7 })
}));

vi.mock("./api/clusters", () => ({
  classifyMe: vi.fn().mockResolvedValue({ cluster_label: "代谢风险型" })
}));

describe("phase report direct portal page", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:phase") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

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

  it("exports the four-week phase assessment PDF from the report action", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "导出 PDF" }));

    await waitFor(() => expect(exportPhaseAssessmentPdfReport).toHaveBeenCalledWith(4));
    expect(await screen.findByText("阶段 PDF 已导出")).toBeInTheDocument();
  });
});
