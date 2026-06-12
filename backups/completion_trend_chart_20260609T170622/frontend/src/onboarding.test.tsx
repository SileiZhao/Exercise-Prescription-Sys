import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const acceptConsentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));
const upsertProfileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));
const getHealthSnapshotMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  profile: { name: "缺项用户", bmi: 24.8 },
  fitness_test: null,
  body_composition: null,
  biochemical_index: null,
  risk_screening: null,
  exercise_feedback: null,
  completion_status: {
    minimum_required_complete: false,
    prescription_generation_blocked: true,
    completed_categories: ["profile"],
    missing_categories: ["fitness_test", "risk_screening"],
    missing_required_fields: {
      fitness_test: ["resting_hr", "sbp", "dbp", "pain_score"],
      risk_screening: ["risk_screening"]
    },
    blocking_reasons: ["缺少最小必填集：体质测试、风险问卷"],
    suggestions: [
      { category: "fitness_test", title: "补充体质测试", fields: ["静息心率", "血压", "疼痛评分"] },
      { category: "risk_screening", title: "完成风险问卷", fields: ["PAR-Q+", "红旗症状", "慢病史"] }
    ],
    summary: "当前缺少最小必填集，AI 不会编造用户没有提供的数据。"
  }
}));

vi.mock("./api/healthData", () => ({
  acceptConsent: acceptConsentMock,
  createBiochemicalIndex: vi.fn().mockResolvedValue({ id: 1 }),
  createBodyComposition: vi.fn().mockResolvedValue({ id: 1 }),
  createFitnessTest: vi.fn().mockResolvedValue({ id: 1 }),
  getHealthSnapshot: getHealthSnapshotMock,
  createRiskScreening: vi.fn().mockResolvedValue({ id: 1 }),
  upsertProfile: upsertProfileMock
}));

describe("onboarding wizard", () => {

  it("shows backend missing-data guidance and blocks prescription generation when minimum fields are incomplete", async () => {
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

    expect(await screen.findByText("缺项提醒")).toBeInTheDocument();
    expect(screen.getByText("当前缺少最小必填集，AI 不会编造用户没有提供的数据。")).toBeInTheDocument();
    expect(screen.getByText("缺少最小必填集：体质测试、风险问卷")).toBeInTheDocument();
    expect(screen.getByText("补充体质测试")).toBeInTheDocument();
    expect(screen.getByText("完成风险问卷")).toBeInTheDocument();
    expect(screen.getByText("处方生成已阻断")).toBeInTheDocument();
    await waitFor(() => expect(getHealthSnapshotMock).toHaveBeenCalled());
  });

  it("renders six-category onboarding steps for authenticated users", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/onboarding"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    const stepNav = await screen.findByRole("navigation", { name: "建档步骤" });
    expect(within(stepNav).getByText("知情同意")).toBeInTheDocument();
    expect(screen.getByText(/本步用途/)).toBeInTheDocument();
    expect(screen.getByText(/确认知情同意/)).toBeInTheDocument();
    expect(within(stepNav).getByText("基础信息")).toBeInTheDocument();
    expect(within(stepNav).getByText("体质测试")).toBeInTheDocument();
    expect(within(stepNav).getByText("身体成分")).toBeInTheDocument();
    expect(within(stepNav).getByText("生化指标")).toBeInTheDocument();
    expect(within(stepNav).getByText("风险问卷")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存并下一步" })).toBeInTheDocument();
  });

  it("persists profile draft and blocks out-of-range values with zod validation", async () => {
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

    fireEvent.click(await screen.findByLabelText(/我已阅读并同意/));
    fireEvent.click(screen.getByRole("button", { name: "保存并下一步" }));

    await screen.findByLabelText("身高");
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "试运行用户" } });
    fireEvent.change(screen.getByLabelText("出生日期"), { target: { value: "1988-06-01" } });
    fireEvent.change(screen.getByLabelText("身高"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("体重"), { target: { value: "72" } });

    await waitFor(() => expect(localStorage.getItem("exercise-health-data-draft") ?? "").toContain('"name":"试运行用户"'));

    fireEvent.click(screen.getByRole("button", { name: "保存并下一步" }));

    expect(await screen.findByText("身高需在80-230 cm之间")).toBeInTheDocument();
    expect(upsertProfileMock).not.toHaveBeenCalled();
  });

  it("shows live BMI and waist-hip ratio capsules on the profile step", async () => {
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

    fireEvent.click(await screen.findByLabelText(/我已阅读并同意/));
    fireEvent.click(screen.getByRole("button", { name: "保存并下一步" }));

    await screen.findByText(/本步用途.*生成风险筛查/);
    fireEvent.change(screen.getByLabelText("身高"), { target: { value: "170" } });
    fireEvent.change(screen.getByLabelText("体重"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("腰围"), { target: { value: "84" } });
    fireEvent.change(screen.getByLabelText("臀围"), { target: { value: "100" } });

    await waitFor(() => expect(screen.getByText("24.9")).toBeInTheDocument());
    expect(screen.getByText("BMI")).toBeInTheDocument();
    expect(screen.getByText("腰臀比")).toBeInTheDocument();
    expect(screen.getByText("0.84")).toBeInTheDocument();
  });

});
