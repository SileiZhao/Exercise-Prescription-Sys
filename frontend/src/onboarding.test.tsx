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
});
