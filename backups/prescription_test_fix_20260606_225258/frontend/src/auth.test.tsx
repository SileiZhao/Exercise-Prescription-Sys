import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const loginMock = vi.hoisted(() => vi.fn());
const getCurrentUserMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 1,
    email: "user@example.com",
    full_name: "普通用户",
    role: "USER",
    organization_id: null,
    is_active: true,
    is_verified: true,
    must_change_password: false
  })
);
const changePasswordMock = vi.hoisted(() => vi.fn().mockResolvedValue({ must_change_password: false }));

vi.mock("./api/auth", () => ({
  changePassword: changePasswordMock,
  getCurrentUser: getCurrentUserMock,
  login: loginMock,
  registerUser: vi.fn()
}));

describe("auth routes", () => {
  beforeEach(() => {
    localStorage.clear();
    loginMock.mockReset();
    changePasswordMock.mockReset();
    changePasswordMock.mockResolvedValue({ must_change_password: false });
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue({
      id: 1,
      email: "user@example.com",
      full_name: "普通用户",
      role: "USER",
      organization_id: null,
      is_active: true,
      is_verified: true,
      must_change_password: false
    });
  });

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

  it("renders register form without privileged role choices", () => {
    render(
      <MemoryRouter initialEntries={["/register"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("姓名")).toBeInTheDocument();
    expect(screen.queryByLabelText("角色")).not.toBeInTheDocument();
    expect(screen.queryByText("管理员")).not.toBeInTheDocument();
    expect(screen.queryByText("专家")).not.toBeInTheDocument();
    expect(screen.queryByText("科研人员")).not.toBeInTheDocument();
    expect(screen.queryByText("机构管理员")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /注\s*册/ })).toBeInTheDocument();
  });

  it("shows 403 when an expert opens a user-only page", async () => {
    localStorage.setItem("access_token", "expert-token");
    getCurrentUserMock.mockResolvedValue({
      id: 2,
      email: "expert@example.com",
      full_name: "审核专家",
      role: "EXPERT",
      organization_id: 1,
      is_active: true,
      is_verified: true,
      must_change_password: false
    });

    render(
      <MemoryRouter initialEntries={["/user/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(screen.getByText("当前账号无权访问此页面")).toBeInTheDocument();
  });

  it("does not trust a tampered cached role before rendering protected pages", async () => {
    localStorage.setItem("access_token", "user-token");
    localStorage.setItem("current_user_role", "ADMIN");
    localStorage.setItem("current_user_id", "999");
    getCurrentUserMock.mockResolvedValue({
      id: 1,
      email: "user@example.com",
      full_name: "普通用户",
      role: "USER",
      organization_id: null,
      is_active: true,
      is_verified: true,
      must_change_password: false
    });

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(screen.queryByText("管理看板")).not.toBeInTheDocument();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("current_user_role")).toBe("USER");
    expect(localStorage.getItem("current_user_id")).toBe("1");
  });

  it("stores refresh token and redirects default accounts to change password", async () => {
    loginMock.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
      must_change_password: true
    });

    render(
      <MemoryRouter initialEntries={["/login"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "seeded@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "SeededPass123" } });
    fireEvent.click(screen.getByRole("button", { name: /登\s*录/ }));

    expect(await screen.findByText("首次登录修改密码")).toBeInTheDocument();
    expect(localStorage.getItem("access_token")).toBe("access-token");
    expect(localStorage.getItem("refresh_token")).toBe("refresh-token");
    expect(localStorage.getItem("current_user_id")).toBe("1");
  });

  it("stores current user id when a protected route hydrates the current account", async () => {
    localStorage.setItem("access_token", "researcher-token");
    getCurrentUserMock.mockResolvedValue({
      id: 42,
      email: "researcher@example.com",
      full_name: "科研人员",
      role: "RESEARCHER",
      organization_id: 1,
      is_active: true,
      is_verified: true,
      must_change_password: false
    });

    render(
      <MemoryRouter initialEntries={["/auth/change-password"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("首次登录修改密码")).toBeInTheDocument();
    expect(localStorage.getItem("current_user_role")).toBe("RESEARCHER");
    expect(localStorage.getItem("current_user_id")).toBe("42");
  });

  it("submits first-login password change", async () => {
    localStorage.setItem("access_token", "access-token");

    render(
      <MemoryRouter initialEntries={["/auth/change-password"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText("当前密码"), { target: { value: "SeededPass123" } });
    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "ChangedSeededPass123" } });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    await waitFor(() =>
      expect(changePasswordMock).toHaveBeenCalledWith({
        current_password: "SeededPass123",
        new_password: "ChangedSeededPass123"
      })
    );
  });
});
