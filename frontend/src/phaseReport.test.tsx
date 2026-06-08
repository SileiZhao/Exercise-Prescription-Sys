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
    measurement_changes: {
      profile: {
        weight_kg: { before: 86, after: 82, delta: -4 },
        bmi: { before: 29.76, after: 28.37, delta: -1.39 },
        waist_cm: { before: 98, after: 93, delta: -5 }
      },
      fitness_test: {
        sbp: { before: 142, after: 132, delta: -10 },
        dbp: { before: 92, after: 84, delta: -8 }
      },
      body_composition: {
        body_fat_pct: { before: 31.5, after: 28, delta: -3.5 },
        skeletal_muscle_kg: { before: 25.2, after: 26.1, delta: 0.9 }
      },
      biochemical_index: {
        fbg: { value: null, null_reason: "BiochemicalIndex 记录不足 2 条，无法计算最早与最新差值" }
      }
    },
    recommendations: ["疼痛或RPE偏高，进入专家复核"]
  })
}));

describe("phase report page", () => {
  it("renders phase assessment metrics and recommendations", async () => {
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

    expect(await screen.findByText("阶段报告")).toBeInTheDocument();
    expect(screen.getByText("AI 运动处方")).toBeInTheDocument();
    expect(
      await screen.findByText("近4周共记录3次运动反馈，平均完成率71.67%，平均RPE 8，疼痛事件2次，不适事件1次。")
    ).toBeInTheDocument();
    expect(screen.getByText("打卡次数")).toBeInTheDocument();
    expect(screen.getByText("3次")).toBeInTheDocument();
    expect(screen.getByText("评估周期")).toBeInTheDocument();
    expect(screen.getByText("4周")).toBeInTheDocument();
    expect(screen.getByText("71.67%")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2次")).toBeInTheDocument();
    expect(screen.getByText("疼痛或RPE偏高，进入专家复核")).toBeInTheDocument();
    expect(screen.getByText("阶段变化")).toBeInTheDocument();
    expect(screen.getByText("阶段指标对比")).toBeInTheDocument();
    expect(screen.getByTestId("StageEvaluationCompareChart-echart")).toBeInTheDocument();
    expect(screen.getByText("阶段反馈趋势")).toBeInTheDocument();
    expect(screen.getByTestId("FeedbackTrendChart-echart")).toBeInTheDocument();
    expect(screen.getByText("体重")).toBeInTheDocument();
    expect(screen.getByText("86 → 82")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
    expect(screen.getByText("收缩压")).toBeInTheDocument();
    expect(screen.getByText("142 → 132")).toBeInTheDocument();
    expect(screen.getByText("BiochemicalIndex 记录不足 2 条，无法计算最早与最新差值")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出阶段报告 Word" }));
    await waitFor(() => expect(exportPhaseAssessmentReport).toHaveBeenCalledWith(4));
    fireEvent.click(screen.getByRole("button", { name: "导出阶段报告 PDF" }));
    await waitFor(() => expect(exportPhaseAssessmentPdfReport).toHaveBeenCalledWith(4));
  });
});
