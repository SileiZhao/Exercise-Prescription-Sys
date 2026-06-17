import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockRejectedValue(new Error("not needed"))
}));

vi.mock("./api/prescriptions", () => ({
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

vi.mock("./api/feedback", () => ({
  getPhaseAssessment: vi.fn().mockRejectedValue(new Error("not needed"))
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
});
