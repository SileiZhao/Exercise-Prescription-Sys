import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const listMyPrescriptionsMock = vi.hoisted(() => vi.fn());
const listReportExportRecordsMock = vi.hoisted(() => vi.fn());
const exportPrescriptionPdfReportMock = vi.hoisted(() => vi.fn());
const exportPrescriptionReportMock = vi.hoisted(() => vi.fn());

vi.mock("./api/prescriptions", () => ({
  exportPrescriptionPdfReport: exportPrescriptionPdfReportMock,
  exportPrescriptionReport: exportPrescriptionReportMock,
  generatePrescription: vi.fn(),
  listMyPrescriptions: listMyPrescriptionsMock,
  listReportExportRecords: listReportExportRecordsMock
}));

describe("prescription page", () => {
  beforeEach(() => {
    listMyPrescriptionsMock.mockResolvedValue([]);
    listReportExportRecordsMock.mockResolvedValue({ total: 0, items: [] });
    exportPrescriptionPdfReportMock.mockClear();
    exportPrescriptionReportMock.mockClear();
  });

  it("renders user prescription generation entry", async () => {
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

    expect(await screen.findByText("我的处方")).toBeInTheDocument();
    expect(listMyPrescriptionsMock).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "生成处方" })).toBeInTheDocument();
    expect(screen.getByText("R2 处方必须专家审核后发布，R3 不生成训练计划。")).toBeInTheDocument();
  });

  it("renders pending R2 prescription safety state without FITT-VP training plan or report exports", async () => {
    listMyPrescriptionsMock.mockResolvedValue([
      {
        id: 21,
        risk_level: "R2",
        cluster_label: "高血压谨慎型",
        goals: ["增强心肺"],
        fitt_vp: {
          frequency: "每周3次",
          intensity: "低强度",
          time: "每次20分钟",
          type: ["快走", "八段锦"],
          volume: "每周60分钟",
          progression: "2周后根据血压和RPE再调整"
        },
        precautions: ["运动前后监测血压"],
        contraindications: ["憋气用力"],
        reassessment: "2周复核",
        evidence_refs: [],
        safety_notice: "AI 初稿已按规则约束生成，不替代医疗诊断。",
        status: "PENDING_REVIEW",
        expert_review_required: true,
        version: 1,
        created_at: "2026-06-02T00:00:00"
      }
    ]);

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

    await waitFor(() => expect(screen.getAllByText("PENDING_REVIEW").length).toBeGreaterThan(0));
    expect(screen.getAllByText("R2").length).toBeGreaterThan(0);
    expect(screen.getByText("高血压谨慎型")).toBeInTheDocument();
    expect(screen.getByText("专家审核前不展示训练计划")).toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 处方结构")).not.toBeInTheDocument();
    expect(screen.queryByText("频率")).not.toBeInTheDocument();
    expect(screen.getByText("禁忌动作与停止运动条件")).toBeInTheDocument();
    expect(screen.getAllByText(/憋气用力/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/frequency/)).not.toBeInTheDocument();
    expect(screen.queryByText(/每周3次/)).not.toBeInTheDocument();
    expect(screen.queryByText(/快走/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出处方报告 Word" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出处方报告 PDF" })).not.toBeInTheDocument();
    expect(exportPrescriptionReportMock).not.toHaveBeenCalled();
    expect(exportPrescriptionPdfReportMock).not.toHaveBeenCalled();
  });

  it("renders R3 safety notice without FITT-VP training plan", async () => {
    listMyPrescriptionsMock.mockResolvedValue([
      {
        id: 22,
        risk_level: "R3",
        cluster_label: "高风险转介型",
        goals: ["安全评估"],
        fitt_vp: {
          frequency: "每周5次",
          intensity: "中高强度",
          time: "每次45分钟",
          type: ["跑步"],
          progression: "每周增加训练量"
        },
        precautions: ["当前存在高风险信号"],
        contraindications: ["禁止生成训练处方"],
        reassessment: "医学评估后再确定运动计划",
        evidence_refs: [],
        safety_notice: "当前存在高风险信号，系统不生成训练处方，建议先进行医学评估或专业转介。",
        status: "REFERRED",
        expert_review_required: true,
        version: 1,
        created_at: "2026-06-02T00:00:00"
      }
    ]);

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

    await waitFor(() => expect(screen.getAllByText("REFERRED").length).toBeGreaterThan(0));
    expect(screen.getAllByText("R3").length).toBeGreaterThan(0);
    expect(screen.getByText("当前不展示训练计划，仅显示安全提醒和医学评估建议。")).toBeInTheDocument();
    expect(screen.getByText("当前存在高风险信号，系统不生成训练处方，建议先进行医学评估或专业转介。")).toBeInTheDocument();
    expect(screen.queryByText("每周5次")).not.toBeInTheDocument();
    expect(screen.queryByText("跑步")).not.toBeInTheDocument();
    expect(screen.queryByText("中高强度")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出处方报告 Word" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出处方报告 PDF" })).not.toBeInTheDocument();
    expect(exportPrescriptionReportMock).not.toHaveBeenCalled();
    expect(exportPrescriptionPdfReportMock).not.toHaveBeenCalled();
  });
});
