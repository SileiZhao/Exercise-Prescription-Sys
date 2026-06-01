import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the platform shell", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("AI 个性化运动处方平台")).toBeInTheDocument();
    expect(screen.getByText("用户端")).toBeInTheDocument();
    expect(screen.getByText("专家端")).toBeInTheDocument();
    expect(screen.getByText("管理端")).toBeInTheDocument();
    expect(screen.getByText("科研端")).toBeInTheDocument();
  });
});
