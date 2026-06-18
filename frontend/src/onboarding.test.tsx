import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { classifyMe } from "./api/clusters";
import {
  acceptConsent,
  createBiochemicalIndex,
  createBodyComposition,
  createFitnessTest,
  createRiskScreening,
  upsertProfile
} from "./api/healthData";
import { generatePrescription } from "./api/prescriptions";

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/prescriptions", () => ({
  exportPrescriptionPdfReport: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  exportPrescriptionReport: vi.fn().mockResolvedValue(new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  generatePrescription: vi.fn().mockResolvedValue({
    id: 21,
    risk_level: "R1",
    cluster_label: "代谢风险型",
    goals: ["增强心肺"],
    fitt_vp: null,
    precautions: [],
    contraindications: [],
    reassessment: "4周复评",
    evidence_refs: [],
    safety_notice: null,
    status: "PUBLISHED",
    expert_review_required: false,
    version: 1,
    created_at: "2026-06-18T00:00:00"
  }),
  listMyPrescriptions: vi.fn().mockResolvedValue([])
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
  createExerciseFeedback: vi.fn().mockResolvedValue({ id: 8 }),
  createRiskScreening: vi.fn().mockResolvedValue({ id: 6, risk_level: "R1" })
}));

vi.mock("./api/clusters", () => ({
  classifyMe: vi.fn().mockResolvedValue({
    id: 7,
    user_id: 1,
    model_id: null,
    rule_labels: ["代谢风险"],
    cluster_label: "代谢风险型",
    cluster_id: null,
    profile_summary: "代谢风险与久坐低体能",
    risk_override: false,
    created_at: "2026-06-18T00:00:00"
  })
}));

describe("onboarding direct portal page", () => {
  it("renders the user-pages health onboarding layout and red-flag warning", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/health-data"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "健康建档向导" })).toBeInTheDocument();
    expect(screen.getByText("基础档案")).toBeInTheDocument();
    expect(screen.getByText("第五步：慢病与风险问卷")).toBeInTheDocument();
    expect(screen.getByText("心血管与红旗症状筛查")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("不明原因的胸痛、胸闷或心前区压榨感"));

    expect(screen.getByText("触发医疗转介警告")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成评估结果" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "用户建档" })).not.toBeInTheDocument();
  });

  it("saves the complete health profile draft through the health-data APIs", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/health-data"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(acceptConsent).toHaveBeenCalledTimes(1));
    expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ name: "处方用户", exercise_goal: expect.arrayContaining(["增强心肺"]) }));
    expect(createFitnessTest).toHaveBeenCalledWith(expect.objectContaining({ resting_hr: 78, sbp: 128, dbp: 82, pain_score: 1 }));
    expect(createBodyComposition).toHaveBeenCalledWith(expect.objectContaining({ body_fat_pct: 31, visceral_fat_level: 12 }));
    expect(createBiochemicalIndex).toHaveBeenCalledWith(expect.objectContaining({ fbg: 5.8, ldl_c: 3 }));
    expect(createRiskScreening).toHaveBeenCalledWith(expect.objectContaining({ chest_pain: false, syncope: false, abnormal_dyspnea: false }));
    expect(await screen.findByText("健康建档草稿已保存")).toBeInTheDocument();
  });

  it("classifies the user and generates a prescription from the onboarding result action", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/health-data"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "生成评估结果" }));

    await waitFor(() => expect(classifyMe).toHaveBeenCalledTimes(1));
    expect(generatePrescription).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("评估结果已生成")).toBeInTheDocument();
    expect(screen.getByText("分型：代谢风险型；处方：R1 已发布。")).toBeInTheDocument();
  });
});
