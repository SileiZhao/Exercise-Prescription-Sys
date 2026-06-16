import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const listUsersMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total: 2,
    items: [
      {
        id: 1,
        email: "user@example.com",
        phone: null,
        full_name: "普通用户",
        role: "USER",
        organization_id: 1,
        is_active: true,
        is_verified: false,
        created_at: "2026-05-30T10:00:00"
      },
      {
        id: 2,
        email: "expert@example.com",
        phone: null,
        full_name: "审核专家",
        role: "EXPERT",
        organization_id: 1,
        is_active: true,
        is_verified: true,
        created_at: "2026-05-30T10:00:00"
      }
    ]
  })
);

vi.mock("./api/adminUsers", () => ({
  createExpertProfile: vi.fn(),
  createOrganization: vi.fn(),
  listExpertProfiles: vi.fn().mockResolvedValue([
    {
      id: 1,
      user_id: 2,
      title: "副教授",
      specialty: "慢病运动干预",
      certificate_no: "CERT-001",
      bio: "负责 R2 处方审核",
      review_capacity_per_day: 25,
      status: "ACTIVE",
      created_at: "2026-05-30T10:00:00",
      user: {
        id: 2,
        email: "expert@example.com",
        phone: null,
        full_name: "审核专家",
        role: "EXPERT",
        organization_id: 1,
        is_active: true,
        is_verified: true,
        created_at: "2026-05-30T10:00:00"
      }
    }
  ]),
  listOrganizations: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "社区运动健康中心",
      type: "COMMUNITY",
      contact_person: "张老师",
      contact_phone: "13800001111",
      address: "郑州市健康路1号",
      status: "ACTIVE",
      created_at: "2026-05-30T10:00:00"
    }
  ]),
  listUsers: listUsersMock,
  updateUser: vi.fn()
}));

describe("admin users page", () => {
  it("renders users, organizations and expert profiles", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter initialEntries={["/admin/users"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "身份治理台" })).toBeInTheDocument();
    expect(screen.getByText("衡策运动处方平台")).toBeInTheDocument();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect((await screen.findAllByText("社区运动健康中心")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "维护" })).not.toBeInTheDocument();
    expect(screen.getByText("点选查看")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "专家资料" }));
    expect(await screen.findByText("慢病运动干预")).toBeInTheDocument();
  });

  it("filters users by keyword and role", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");
    listUsersMock.mockClear();

    render(
      <MemoryRouter initialEntries={["/admin/users"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "身份治理台" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "筛选用户" }));
    const filterDialog = await screen.findByRole("dialog", { name: "筛选用户" });
    fireEvent.change(within(filterDialog).getByLabelText("用户关键词"), { target: { value: "expert" } });
    fireEvent.mouseDown(within(filterDialog).getByLabelText("角色筛选"));
    const expertOptions = await screen.findAllByText("专家");
    fireEvent.click(expertOptions[expertOptions.length - 1]);
    fireEvent.click(within(filterDialog).getByRole("button", { name: "应用筛选" }));

    await waitFor(() =>
      expect(listUsersMock).toHaveBeenLastCalledWith({
        q: "expert",
        role: "EXPERT",
        page: 1,
        page_size: 10
      })
    );
  });
});
