import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/adminAudit", () => ({
  listAuditLogs: vi.fn().mockResolvedValue({
    total: 2,
    items: [
      {
        id: 2,
        actor_id: 1,
        action: "FEEDBACK_ADJUST_PRESCRIPTION",
        resource_type: "PrescriptionRecord",
        resource_id: "10",
        metadata: { decision: "REVIEW_REQUIRED" },
        created_at: "2026-05-30T10:00:00"
      },
      {
        id: 1,
        actor_id: 1,
        action: "GENERATE_PRESCRIPTION",
        resource_type: "PrescriptionRecord",
        resource_id: "10",
        metadata: { risk_level: "R2" },
        created_at: "2026-05-30T09:00:00"
      }
    ]
  })
}));

describe("admin audit log page", () => {
  it("renders compact audit table and opens metadata in the detail drawer", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(screen.getByText("启衡")).toBeInTheDocument();
    expect(await screen.findByText("反馈调整处方")).toBeInTheDocument();
    expect(screen.getAllByText("运动处方")[0]).toBeInTheDocument();
    expect(screen.queryByText("FEEDBACK_ADJUST_PRESCRIPTION")).not.toBeInTheDocument();
    expect(screen.queryByText("PrescriptionRecord")).not.toBeInTheDocument();
    expect(screen.queryByText("decision：REVIEW_REQUIRED")).not.toBeInTheDocument();
    expect(screen.queryByText("risk_level：R2")).not.toBeInTheDocument();
    expect(screen.queryByText(/"decision"/)).not.toBeInTheDocument();
    expect(screen.getByText("生成")).toBeInTheDocument();

    fireEvent.click(screen.getByText("反馈调整处方"));
    expect(await screen.findByText("审计详情 #2")).toBeInTheDocument();
    expect(screen.getByText("decision：REVIEW_REQUIRED")).toBeInTheDocument();
  });
});
