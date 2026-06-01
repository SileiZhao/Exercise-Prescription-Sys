import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      name: "社区示范中心",
      type: "COMMUNITY",
      contact_person: "张老师",
      contact_phone: "13800001111",
      address: "郑州市示范路1号",
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

    render(
      <MemoryRouter initialEntries={["/admin/users"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("用户与专家管理")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("社区示范中心")).toBeInTheDocument();
    expect(screen.getByText("慢病运动干预")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存机构" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存专家资料" })).toBeInTheDocument();
  });

  it("filters users by keyword and role", async () => {
    localStorage.setItem("access_token", "test-token");
    listUsersMock.mockClear();

    render(
      <MemoryRouter initialEntries={["/admin/users"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("用户与专家管理")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("用户关键词"), { target: { value: "expert" } });
    fireEvent.mouseDown(screen.getByLabelText("角色筛选"));
    const expertOptions = await screen.findAllByText("专家");
    fireEvent.click(expertOptions[expertOptions.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "筛选用户" }));

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
