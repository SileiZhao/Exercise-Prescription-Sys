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
  it("renders audit log workbench with filters, paged rows and metadata drawer", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("审计日志")).toBeInTheDocument();
    expect(screen.getByText("AI 运动处方")).toBeInTheDocument();
    expect(screen.getByText("审计监控总览")).toBeInTheDocument();
    expect(screen.getByText("筛选后 2 / 全部 2")).toBeInTheDocument();
    expect(screen.getByText("每页 12 条，详情在抽屉中查看")).toBeInTheDocument();
    expect((await screen.findAllByText("FEEDBACK_ADJUST_PRESCRIPTION")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("PrescriptionRecord")[0]).toBeInTheDocument();
    expect(screen.queryByText("decision：REVIEW_REQUIRED")).not.toBeInTheDocument();
    expect(screen.queryByText("risk_level：R2")).not.toBeInTheDocument();
    expect(screen.queryByText(/"decision"/)).not.toBeInTheDocument();
    expect(screen.getByText("GENERATE_PRESCRIPTION")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("审计筛选"), { target: { value: "FEEDBACK" } });
    expect(screen.getByText("筛选后 1 / 全部 2")).toBeInTheDocument();
    expect(screen.queryByText("GENERATE_PRESCRIPTION")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看审计详情" }));
    expect(await screen.findByText("审计详情")).toBeInTheDocument();
    expect(screen.getByText("元数据字段")).toBeInTheDocument();
    expect(screen.getByText("decision：REVIEW_REQUIRED")).toBeInTheDocument();
    expect(screen.queryByText(/"decision"/)).not.toBeInTheDocument();
  });
});
