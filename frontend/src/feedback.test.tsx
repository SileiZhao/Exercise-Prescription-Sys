import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const adjustFeedbackMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    action: "REVIEW_REQUIRED",
    reasons: ["疼痛加重", "RPE偏高"],
    new_prescription_id: 10,
    version_id: 2
  })
);
const createExerciseFeedbackMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 88 }));
const listMyPrescriptionsMock = vi.hoisted(() => vi.fn());
const getUserDashboardMock = vi.hoisted(() => vi.fn());

vi.mock("./api/feedback", () => ({
  adjustFeedback: adjustFeedbackMock
}));

vi.mock("./api/healthData", () => ({
  createExerciseFeedback: createExerciseFeedbackMock,
  getHealthSnapshot: vi.fn().mockResolvedValue(null)
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: listMyPrescriptionsMock,
  generatePrescription: vi.fn()
}));

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: getUserDashboardMock
}));

describe("today exercise feedback page", () => {
  beforeEach(() => {
    listMyPrescriptionsMock.mockResolvedValue([
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
    ]);
    getUserDashboardMock.mockResolvedValue({
      current_risk_level: "R1",
      expert_review_status: "APPROVED",
      today_can_exercise: true,
      today_block_reason: null,
      weekly_completion_rate: 80,
      current_stage_goals: [],
      recent_feedback: null,
      monitoring_reminders: [],
      prescription_id: 10,
      prescription_version: 1,
      next_reassessment_date: null,
      streak_days: 0,
      weekly_target_hits: 0,
      plan_completion_trend: [],
      feedback_trend: [],
      health_radar: [],
      abnormal_feedback_count: 0,
      review_status_label: "已发布",
      prescription_summary: null
    });
    createExerciseFeedbackMock.mockClear();
    adjustFeedbackMock.mockClear();
    getUserDashboardMock.mockClear();
  });

  it("renders workout check-in and dynamic adjustment controls", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "运动前安全闸门" })).toBeInTheDocument();
    expect(await screen.findByText("运动反馈")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "记录运动反馈" }));
    expect(screen.getByText("我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号")).toBeInTheDocument();
    expect(screen.getByLabelText("RPE")).toBeInTheDocument();
    expect(screen.getByLabelText("疼痛评分")).toBeInTheDocument();
    expect(screen.getByText("不适反应")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交打卡并动态调整" })).toBeInTheDocument();
  });

  it("shows today's executable prescription as structured FITT-VP text without raw JSON keys", async () => {
    listMyPrescriptionsMock.mockResolvedValue([
      {
        id: 12,
        risk_level: "R1",
        cluster_label: "初级运动水平",
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
        created_at: "2026-05-30T00:00:00"
      }
    ]);
    getUserDashboardMock.mockResolvedValue({
      current_risk_level: "R3",
      expert_review_status: "REFERRED",
      today_can_exercise: false,
      today_block_reason: "R3 仅显示医学评估建议。",
      weekly_completion_rate: 0,
      current_stage_goals: [],
      recent_feedback: null,
      monitoring_reminders: [],
      prescription_id: null,
      prescription_version: null,
      next_reassessment_date: null,
      streak_days: 0,
      weekly_target_hits: 0,
      plan_completion_trend: [],
      feedback_trend: [],
      health_radar: [],
      abnormal_feedback_count: 0,
      review_status_label: "已转介",
      prescription_summary: null
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("FITT-VP 处方结构")).toBeInTheDocument();
    expect(screen.getByText("频率")).toBeInTheDocument();
    expect(screen.getByText("每周3次")).toBeInTheDocument();
    expect(screen.getByText("禁忌动作与停止运动条件")).toBeInTheDocument();
    expect(screen.getByText("憋气用力")).toBeInTheDocument();
    expect(screen.queryByText(/frequency/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"type"/)).not.toBeInTheDocument();
  });

  it("submits feedback and displays dynamic adjustment result", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "记录运动反馈" }));
    fireEvent.click(await screen.findByLabelText("我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号"));
    fireEvent.click(screen.getByRole("button", { name: "提交打卡并动态调整" }));

    await waitFor(() => expect(createExerciseFeedbackMock).toHaveBeenCalled());
    expect(adjustFeedbackMock).toHaveBeenCalledWith(88);
    expect(await screen.findByText("动态调整结果：进入专家复核")).toBeInTheDocument();
    expect(screen.getByText("疼痛加重；RPE偏高")).toBeInTheDocument();
  });

  it("does not fall back to pending review or R3 prescriptions for today's exercise", async () => {
    listMyPrescriptionsMock.mockResolvedValue([
      {
        id: 20,
        risk_level: "R2",
        cluster_label: "高血压谨慎型",
        goals: ["控压"],
        fitt_vp: { type: ["快走"], time: "每次20分钟" },
        precautions: ["等待专家审核"],
        contraindications: [],
        reassessment: "2周复核",
        evidence_refs: [],
        safety_notice: null,
        status: "PENDING_REVIEW",
        expert_review_required: true,
        version: 1,
        created_at: "2026-05-28T00:00:00"
      },
      {
        id: 21,
        risk_level: "R3",
        cluster_label: "高风险转介型",
        goals: ["医学评估"],
        fitt_vp: { type: ["快走"], time: "每次10分钟" },
        precautions: ["医学评估"],
        contraindications: ["禁止训练"],
        reassessment: "医学评估后再定",
        evidence_refs: [],
        safety_notice: "请先进行医学评估。",
        status: "PUBLISHED",
        expert_review_required: true,
        version: 2,
        created_at: "2026-05-29T00:00:00"
      }
    ]);
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("当前没有可执行处方")).toBeInTheDocument();
    expect(screen.getByText("训练入口已锁定")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看医学评估建议" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "记录运动反馈" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交打卡并动态调整" })).not.toBeInTheDocument();
    expect(createExerciseFeedbackMock).not.toHaveBeenCalled();
  });

  it("interrupts high-risk feedback before submitting exercise check-in", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    await screen.findByText("运动反馈");
    fireEvent.click(screen.getByRole("button", { name: "记录运动反馈" }));
    fireEvent.click(screen.getByLabelText("胸痛"));

    await screen.findByText("红色安全中断");
    const interruptDialog = screen.getAllByRole("dialog").find((dialog) => within(dialog).queryByText("红色安全中断")) as HTMLElement;
    expect(interruptDialog).toBeInTheDocument();
    expect(within(interruptDialog).getByText(/已出现胸痛、晕厥、严重气短或心悸等安全信号/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交打卡并动态调整" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号"));
    fireEvent.click(screen.getByRole("button", { name: "提交打卡并动态调整" }));

    expect(createExerciseFeedbackMock).not.toHaveBeenCalled();
    expect(adjustFeedbackMock).not.toHaveBeenCalled();
  });

  it("treats palpitation as a red-flag interruption before submitting exercise check-in", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter initialEntries={["/user/today"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    await screen.findByText("运动反馈");
    fireEvent.click(screen.getByRole("button", { name: "记录运动反馈" }));
    fireEvent.click(screen.getByLabelText("心悸"));

    await screen.findByText("红色安全中断");
    const interruptDialog = screen.getAllByRole("dialog").find((dialog) => within(dialog).queryByText("红色安全中断")) as HTMLElement;
    expect(interruptDialog).toBeInTheDocument();
    expect(within(interruptDialog).getByText(/心悸/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交打卡并动态调整" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号"));
    fireEvent.click(screen.getByRole("button", { name: "提交打卡并动态调整" }));

    expect(createExerciseFeedbackMock).not.toHaveBeenCalled();
    expect(adjustFeedbackMock).not.toHaveBeenCalled();
  });
});
