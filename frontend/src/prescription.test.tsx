import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/prescriptions", () => ({
  generatePrescription: vi.fn(),
  listMyPrescriptions: vi.fn().mockResolvedValue([])
}));

describe("prescription page", () => {
  it("renders user prescription generation entry", () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/user/prescriptions"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("我的处方")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成处方" })).toBeInTheDocument();
    expect(screen.getByText("R2 处方必须专家审核后发布，R3 不生成训练计划。")).toBeInTheDocument();
  });
});
