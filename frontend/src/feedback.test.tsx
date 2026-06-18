import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { adjustFeedback } from "./api/feedback";
import { createExerciseFeedback } from "./api/healthData";

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/prescriptions", () => ({
  exportPrescriptionPdfReport: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  exportPrescriptionReport: vi.fn().mockResolvedValue(new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  generatePrescription: vi.fn().mockResolvedValue({ id: 10 }),
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

vi.mock("./api/feedback", () => ({
  adjustFeedback: vi.fn().mockResolvedValue({
    action: "MAINTAIN",
    reasons: ["反馈稳定"],
    new_prescription_id: null,
    version_id: null
  }),
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
  createExerciseFeedback: vi.fn().mockResolvedValue({
    id: 42,
    prescription_id: 10,
    exercise_type: "快走",
    duration_min: 30,
    rpe: 4,
    completion_rate: 100
  })
}));

vi.mock("./api/clusters", () => ({
  classifyMe: vi.fn().mockResolvedValue({ cluster_label: "代谢风险型" })
}));

describe("today exercise direct portal page", () => {
  it("renders the user-pages gatekeeper and transitions into feedback form", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "今日运动打卡" })).toBeInTheDocument();
    expect(screen.getByText("运动前安全确认")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "是，我有不适" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "否，状态良好" }));

    expect(screen.getByText("执行的运动项目")).toBeInTheDocument();
    expect(screen.getByText("主观疲劳感知 (RPE)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交反馈并上传" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "运动前安全闸门" })).not.toBeInTheDocument();
  });

  it("submits today feedback and immediately requests dynamic adjustment", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "否，状态良好" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈并上传" }));

    await waitFor(() => expect(createExerciseFeedback).toHaveBeenCalledTimes(1));
    expect(createExerciseFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        prescription_id: 10,
        pre_exercise_confirmed: true,
        exercise_type: "快走",
        duration_min: 30,
        intensity_level: "中低强度",
        rpe: 4,
        completion_rate: 100
      })
    );
    expect(adjustFeedback).toHaveBeenCalledWith(42);
    expect(await screen.findByText("今日反馈已上传")).toBeInTheDocument();
    expect(screen.getByText("动态调整：MAINTAIN")).toBeInTheDocument();
  });
});
