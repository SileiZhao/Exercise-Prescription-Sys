import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const exportPrescriptionReport = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["docx"])));
const exportPrescriptionPdfReport = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["pdf"])));
const listReportExportRecords = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total: 2,
    items: [
      {
        id: 2,
        user_id: 1,
        exported_by: 1,
        prescription_id: 8,
        report_type: "PRESCRIPTION",
        format: "pdf",
        filename: "prescription-8-v1.pdf",
        risk_level: "R1",
        status: "PUBLISHED",
        version: 1,
        metadata: {},
        created_at: "2026-05-30T10:00:00"
      },
      {
        id: 1,
        user_id: 1,
        exported_by: 1,
        prescription_id: 8,
        report_type: "PRESCRIPTION",
        format: "docx",
        filename: "prescription-8-v1.docx",
        risk_level: "R1",
        status: "PUBLISHED",
        version: 1,
        metadata: {},
        created_at: "2026-05-30T09:00:00"
      }
    ]
  })
);

vi.mock("./api/prescriptions", () => ({
  generatePrescription: vi.fn(),
  exportPrescriptionReport,
  exportPrescriptionPdfReport,
  listReportExportRecords,
  listMyPrescriptions: vi.fn().mockResolvedValue([
    {
      id: 8,
      risk_level: "R1",
      cluster_label: "心肺功能不足型",
      goals: ["增强心肺"],
      fitt_vp: {
        frequency: "每周4次",
        intensity: "低—中等强度",
        time: "每次30分钟",
        type: ["快走"],
        volume: "每周120分钟",
        progression: "每2周调整"
      },
      precautions: ["监测RPE"],
      contraindications: ["高强度冲刺"],
      reassessment: "4周小评估",
      evidence_refs: [],
      safety_notice: null,
      status: "PUBLISHED",
      expert_review_required: false,
      version: 1,
      created_at: "2026-05-29T00:00:00"
    }
  ])
}));

describe("prescription report export", () => {
  it("renders Word and PDF report export buttons for the latest prescription", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter
        initialEntries={["/user/prescriptions"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "导出处方报告 Word" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "导出处方报告 PDF" })).toBeInTheDocument();
    expect(screen.getByTestId("prescription-safety-panel")).toBeInTheDocument();
    expect(screen.getByText("处方安全发布面板")).toBeInTheDocument();
    expect(screen.getByText("处方 #8")).toBeInTheDocument();
    expect(screen.getByText("报告可导出")).toBeInTheDocument();
    expect(screen.getByText("结构化处方概览")).toBeInTheDocument();
    expect(screen.getByTestId("prescription-detail-workbench")).toBeInTheDocument();
    expect(await screen.findByText("报告导出审计")).toBeInTheDocument();
    expect(screen.getByText("prescription-8-v1.pdf")).toBeInTheDocument();
    expect(screen.getByText("PRESCRIPTION / PDF")).toBeInTheDocument();
  });
});
