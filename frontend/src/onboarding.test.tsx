import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("onboarding wizard", () => {
  it("renders six-category onboarding steps for authenticated users", () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/user/onboarding"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("知情同意")).toBeInTheDocument();
    expect(screen.getByText("基础信息")).toBeInTheDocument();
    expect(screen.getByText("体质测试")).toBeInTheDocument();
    expect(screen.getByText("身体成分")).toBeInTheDocument();
    expect(screen.getByText("生化指标")).toBeInTheDocument();
    expect(screen.getByText("风险问卷")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存并下一步" })).toBeInTheDocument();
  });
});
