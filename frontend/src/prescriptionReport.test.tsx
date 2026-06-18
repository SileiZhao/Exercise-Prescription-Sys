import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { exportPrescriptionPdfReport } from "./api/prescriptions";

vi.mock("./api/prescriptions", () => ({
  exportPrescriptionPdfReport: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  exportPrescriptionReport: vi.fn().mockResolvedValue(new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  generatePrescription: vi.fn().mockResolvedValue({ id: 8 }),
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
  adjustFeedback: vi.fn().mockResolvedValue({ action: "MAINTAIN", reasons: [], new_prescription_id: null, version_id: null }),
  exportPhaseAssessmentPdfReport: vi.fn().mockResolvedValue(new Blob(["phase-pdf"], { type: "application/pdf" })),
  exportPhaseAssessmentReport: vi.fn().mockResolvedValue(new Blob(["phase-docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("not needed"))
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

describe("prescription report entry in direct portal", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:report") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

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
    expect(await screen.findByRole("button", { name: "导出 PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    expect(screen.queryByText("最近导出记录")).not.toBeInTheDocument();
  });

  it("exports the latest prescription PDF from the simplified action", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "导出 PDF" }));

    await waitFor(() => expect(exportPrescriptionPdfReport).toHaveBeenCalledWith(8));
    expect(await screen.findByText("处方 PDF 已导出")).toBeInTheDocument();
  });
});
