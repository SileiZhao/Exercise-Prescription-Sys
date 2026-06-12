import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const acceptConsentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));
const upsertProfileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));

vi.mock("./api/healthData", () => ({
  acceptConsent: acceptConsentMock,
  createBiochemicalIndex: vi.fn().mockResolvedValue({ id: 1 }),
  createBodyComposition: vi.fn().mockResolvedValue({ id: 1 }),
  createFitnessTest: vi.fn().mockResolvedValue({ id: 1 }),
  getHealthSnapshot: vi.fn().mockResolvedValue(null),
  createRiskScreening: vi.fn().mockResolvedValue({ id: 1 }),
  upsertProfile: upsertProfileMock
}));

describe("onboarding wizard", () => {
  beforeEach(() => {
    localStorage.clear();
    acceptConsentMock.mockClear();
    upsertProfileMock.mockClear();
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

    expect(await screen.findByRole("heading", { name: "用户建档" })).toBeInTheDocument();
    expect(screen.getAllByText("知情同意").length).toBeGreaterThan(0);
    expect(screen.getAllByText("基础信息").length).toBeGreaterThan(0);
    expect(screen.getAllByText("体质测试").length).toBeGreaterThan(0);
    expect(screen.getAllByText("身体成分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("生化指标").length).toBeGreaterThan(0);
    expect(screen.getAllByText("风险问卷").length).toBeGreaterThan(0);
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

    expect(await screen.findByRole("heading", { name: "用户建档" })).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText(/我已阅读并同意/));
    fireEvent.click(screen.getByRole("button", { name: "保存并下一步" }));

    await screen.findByLabelText("身高");
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "试运行用户" } });
    fireEvent.change(screen.getByLabelText("出生日期"), { target: { value: "1988-06-01" } });
    fireEvent.change(screen.getByLabelText("身高"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("体重"), { target: { value: "72" } });

    await waitFor(() => expect(localStorage.getItem("exercise-health-data-draft") ?? "").toContain('"name":"试运行用户"'));

    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));

    expect(await screen.findByText("身高需在80-230 cm之间")).toBeInTheDocument();
    expect(upsertProfileMock).not.toHaveBeenCalled();
  });
});
