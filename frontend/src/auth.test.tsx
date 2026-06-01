import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("auth routes", () => {
  it("renders login form", () => {
    render(
      <MemoryRouter initialEntries={["/login"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /登\s*录/ })).toBeInTheDocument();
  });

  it("protects user dashboard without token", () => {
    localStorage.removeItem("access_token");

    render(
      <MemoryRouter initialEntries={["/user/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /登\s*录/ })).toBeInTheDocument();
  });

  it("renders register form with role field", () => {
    render(
      <MemoryRouter initialEntries={["/register"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("姓名")).toBeInTheDocument();
    expect(screen.getByLabelText("角色")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /注\s*册/ })).toBeInTheDocument();
  });
});
