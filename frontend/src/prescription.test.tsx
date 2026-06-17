import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const listMyPrescriptionsMock = vi.hoisted(() => vi.fn());

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: listMyPrescriptionsMock
}));

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("not needed"))
}));

describe("prescription direct portal page", () => {
  beforeEach(() => {
    listMyPrescriptionsMock.mockResolvedValue([
      {
        id: 24,
        risk_level: "R1",
        cluster_label: "心肺功能不足型",
        goals: ["增强心肺"],
        fitt_vp: {
          frequency: "每周3次",
          intensity: "低-中强度",
          time: "每次30分钟",
          type: ["快走"],
          volume: "每周90分钟",
          progression: "每2周按RPE进阶"
        },
        precautions: ["监测RPE"],
        contraindications: ["憋气用力"],
        reassessment: "4周复测",
        evidence_refs: [],
        safety_notice: null,
        status: "PUBLISHED",
        expert_review_required: false,
        version: 2,
        created_at: "2026-06-02T00:00:00"
      }
    ]);
  });

  it("renders the user-pages prescription FITT-VP grid", async () => {
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

    expect(await screen.findByRole("heading", { name: "最新运动处方" })).toBeInTheDocument();
    expect(screen.getByText("个性化运动处方")).toBeInTheDocument();
    expect(screen.getByText("频率 (Frequency)")).toBeInTheDocument();
    expect(await screen.findByText("每周3次")).toBeInTheDocument();
    expect(screen.getByText("禁忌动作与临床限制")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "处方发布面板" })).not.toBeInTheDocument();
  });

  it("keeps pending R2 plans locked in the replacement page", async () => {
    listMyPrescriptionsMock.mockResolvedValueOnce([
      {
        id: 21,
        risk_level: "R2",
        cluster_label: "高血压谨慎型",
        goals: ["增强心肺"],
        fitt_vp: {
          frequency: "每周3次",
          intensity: "低强度",
          time: "每次20分钟",
          type: ["快走"],
          volume: "每周60分钟",
          progression: "2周后调整"
        },
        precautions: ["运动前后监测血压"],
        contraindications: ["憋气用力"],
        reassessment: "2周复核",
        evidence_refs: [],
        safety_notice: "系统初稿已按规则约束生成。",
        status: "PENDING_REVIEW",
        expert_review_required: true,
        version: 1,
        created_at: "2026-06-02T00:00:00"
      }
    ]);
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

    expect(await screen.findByText("专家审核前不展示训练计划")).toBeInTheDocument();
    expect(screen.queryByText("频率 (Frequency)")).not.toBeInTheDocument();
    expect(screen.getByText("憋气用力")).toBeInTheDocument();
  });
});
