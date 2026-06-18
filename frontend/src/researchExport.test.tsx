import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ revoked: true }));
const createResearchExportRequestMock = vi.hoisted(() =>
  vi.fn((payload: { format: "csv" | "xlsx" | "json"; purpose: string }) =>
    Promise.resolve({
      id: 17,
      requested_by: 2,
      format: payload.format,
      purpose: payload.purpose,
      status: "PENDING",
      approved_by: null,
      approval_comment: null,
      row_count: 5000,
      expires_at: null,
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    })
  )
);
const downloadResearchExportRequestMock = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["participant_code"], { type: "text/csv" })));
const approveResearchExportRequestMock = vi.hoisted(() =>
  vi.fn((requestId: number, payload: { approval_comment: string }) =>
    Promise.resolve({
      id: requestId,
      requested_by: 3,
      organization_id: 1,
      format: "json",
      purpose: "高血压人群依从性差异分析",
      status: "APPROVED",
      approved_by: 1,
      approval_comment: payload.approval_comment,
      row_count: 5000,
      expires_at: "2999-06-04T00:00:00",
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    })
  )
);
const rejectResearchExportRequestMock = vi.hoisted(() =>
  vi.fn((requestId: number, payload: { approval_comment: string }) =>
    Promise.resolve({
      id: requestId,
      requested_by: 3,
      organization_id: 1,
      format: "json",
      purpose: "高血压人群依从性差异分析",
      status: "REJECTED",
      approved_by: 1,
      approval_comment: payload.approval_comment,
      row_count: 5000,
      expires_at: null,
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    })
  )
);
const listResearchExportRequestsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: 9,
      requested_by: 3,
      organization_id: 1,
      format: "json",
      purpose: "高血压人群依从性差异分析",
      status: "PENDING",
      approved_by: null,
      approval_comment: null,
      row_count: 5000,
      expires_at: null,
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    },
    {
      id: 8,
      requested_by: 2,
      organization_id: 1,
      format: "csv",
      purpose: "阶段效果分析",
      status: "APPROVED",
      approved_by: 1,
      approval_comment: "同意用于阶段分析",
      row_count: 12000,
      expires_at: "2999-06-04T00:00:00",
      downloaded_at: null,
      created_at: "2026-06-02T00:00:00"
    }
  ])
);
const getResearchSummaryMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total_participants: 12458,
    risk_distribution: { R0: 5241, R1: 4820, R2: 1874, R3: 523 },
    cluster_distribution: { 青年亚健康: 4210, 代谢综合征: 3890, 老年退行性: 2210 },
    cluster_risk_overlay: { 代谢综合征: { R2: 760, R3: 120 }, 老年退行性: { R2: 510 } },
    prescription_status: { PUBLISHED: 3000, PENDING_REVIEW: 180 },
    template_effects: { 减脂模板: 82, 心肺模板: 76 },
    export_job_status: { PENDING: 1, APPROVED: 1 },
    intervention_effects: {
      feedback_count: 34920,
      average_completion_rate: 68.4,
      average_rpe: 12.25,
      discomfort_event_count: 12,
      pain_worsened_count: 3,
      completion_rate_trend: [
        { date: "第1周", value: 62 },
        { date: "第4周", value: 68.4 }
      ],
      rpe_trend: [
        { date: "第1周", value: 13.5 },
        { date: "第4周", value: 12.25 }
      ],
      pain_trend: [
        { date: "第1周", value: 2 },
        { date: "第4周", value: 1 }
      ],
      blood_pressure_trend: [
        { date: "基线", sbp: 136, dbp: 88 },
        { date: "第4周", sbp: 130, dbp: 84 }
      ],
      blood_glucose_trend: [
        { date: "基线", value: 6.2 },
        { date: "第4周", value: 5.7 }
      ]
    }
  })
);
const exportDesensitizedUsersMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        research_subject_id: "RS-001",
        participant_code: "P000001",
        profile: {
          age: 36,
          sex: "男",
          bmi: 28.37,
          name: "真实姓名",
          mobile: "13800138000",
          id_card: "110101199001011234"
        },
        fitness_test: { sbp: 128, dbp: 82 },
        risk_screening: { risk_level: "R1" },
        latest_prescription: { status: "PUBLISHED", cluster_label: "肥胖代谢风险型" }
      }
    ]
  })
);

vi.mock("./api/researchExport", () => ({
  approveResearchExportRequest: approveResearchExportRequestMock,
  createResearchExportRequest: createResearchExportRequestMock,
  downloadResearchExportRequest: downloadResearchExportRequestMock,
  rejectResearchExportRequest: rejectResearchExportRequestMock,
  getResearchSummary: getResearchSummaryMock,
  exportDesensitizedUsers: exportDesensitizedUsersMock,
  listResearchExportRequests: listResearchExportRequestsMock
}));

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return {
    ...actual,
    logout: logoutMock
  };
});

function renderResearchRoute(path: string, role = "RESEARCHER") {
  localStorage.setItem("access_token", "test-token");
  localStorage.setItem("refresh_token", "refresh-token");
  localStorage.setItem("current_user_role", role);
  localStorage.setItem("current_user_id", role === "ADMIN" ? "1" : "2");
  localStorage.setItem("current_user_name", role === "ADMIN" ? "科研管理员" : "王研究员");

  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </MemoryRouter>
  );
}

describe("research direct portal replacement", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:research-export")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
    createResearchExportRequestMock.mockClear();
    downloadResearchExportRequestMock.mockClear();
    approveResearchExportRequestMock.mockClear();
    rejectResearchExportRequestMock.mockClear();
    logoutMock.mockClear();
    listResearchExportRequestsMock.mockClear();
    getResearchSummaryMock.mockClear();
    exportDesensitizedUsersMock.mockClear();
  });

  it("renders the research-pages macro dashboard with de-identification boundaries", async () => {
    renderResearchRoute("/research/dashboard");

    expect(await screen.findByRole("heading", { name: "宏观统计大盘" })).toBeInTheDocument();
    expect(screen.getByText("科研治理端")).toBeInTheDocument();
    expect(screen.getByText("合规与数据脱敏声明")).toBeInTheDocument();
    expect(screen.getByText("脱敏样本总量")).toBeInTheDocument();
    expect(screen.getByText("R3 拦截转介率")).toBeInTheDocument();
    expect(screen.getByText("聚合人群风险层级分布 (R0-R3)")).toBeInTheDocument();
    expect(screen.getByText("V2.1 聚类模型人群分布 (降维呈现)")).toBeInTheDocument();
    expect(screen.queryByText("真实姓名")).not.toBeInTheDocument();
    expect(screen.queryByText("P000001")).not.toBeInTheDocument();
    expect(exportDesensitizedUsersMock).not.toHaveBeenCalled();
  });

  it("renders cluster and intervention pages as direct research portal views", async () => {
    renderResearchRoute("/research/cluster-analysis");

    expect(await screen.findByRole("heading", { name: "人群聚类分析" })).toBeInTheDocument();
    expect(screen.getByText("分型统计")).toBeInTheDocument();
    expect(screen.getByText("风险叠加")).toBeInTheDocument();
    expect(screen.getByText("冷启动说明")).toBeInTheDocument();

    renderResearchRoute("/research/intervention-effects");
    expect(await screen.findByRole("heading", { name: "群体干预效果" })).toBeInTheDocument();
    expect(screen.getByText("依从性趋势")).toBeInTheDocument();
    expect(screen.getByText("主观强度趋势")).toBeInTheDocument();
    expect(screen.getByText("生理趋势")).toBeInTheDocument();
  });

  it("creates and downloads de-identified export jobs without exposing PII", async () => {
    const anchorClicks: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        element.click = vi.fn(() => anchorClicks.push((element as HTMLAnchorElement).download));
      }
      return element;
    });

    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByRole("heading", { name: "数据导出审批" })).toBeInTheDocument();
    expect(screen.getByText("脱敏数据导出申请")).toBeInTheDocument();
    expect(screen.getByText("防泄漏探针检查通过：当前查询满足脱敏安全策略")).toBeInTheDocument();
    expect(screen.queryByText("真实姓名")).not.toBeInTheDocument();
    expect(screen.queryByText("13800138000")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "发起新申请" }));
    const dialog = await screen.findByRole("dialog", { name: "发起脱敏数据导出申请" });
    fireEvent.change(within(dialog).getByLabelText("导出用途"), { target: { value: "高血压人群阶段效果分析" } });
    fireEvent.change(within(dialog).getByLabelText("导出格式"), { target: { value: "xlsx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    await waitFor(() =>
      expect(createResearchExportRequestMock).toHaveBeenCalledWith({
        format: "xlsx",
        purpose: "高血压人群阶段效果分析"
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "下载脱敏数据包 #8" }));
    await waitFor(() => expect(downloadResearchExportRequestMock).toHaveBeenCalledWith(8));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClicks).toEqual(["research-export-8.csv"]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:research-export");

    createElementSpy.mockRestore();
  });

  it("uses the same replacement shell for admin export approval and records approval actions", async () => {
    renderResearchRoute("/admin/research-export", "ADMIN");

    expect(await screen.findByRole("heading", { name: "科研导出审批" })).toBeInTheDocument();
    expect(screen.getByText("研究对象ID")).toBeInTheDocument();
    expect(screen.getByText("参与者编码")).toBeInTheDocument();
    expect(screen.queryByText("RS-001")).not.toBeInTheDocument();
    expect(screen.queryByText("P000001")).not.toBeInTheDocument();
    expect(exportDesensitizedUsersMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("审批意见 / 限制要求"), { target: { value: "同意用于课题结题分析" } });
    fireEvent.click(screen.getByRole("button", { name: "批准并授权导出" }));
    await waitFor(() =>
      expect(approveResearchExportRequestMock).toHaveBeenCalledWith(9, {
        approval_comment: "同意用于课题结题分析"
      })
    );
    await waitFor(() => expect(screen.getAllByText("已批准").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "下载脱敏数据包 #9" })).toBeInTheDocument();
  });

  it("rejects export requests and keeps the local approval queue in sync", async () => {
    renderResearchRoute("/admin/research-export", "ADMIN");

    expect(await screen.findByRole("heading", { name: "科研导出审批" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("审批意见 / 限制要求"), { target: { value: "缺少伦理审批编号，暂不批准" } });
    fireEvent.click(screen.getByRole("button", { name: "驳回申请" }));

    await waitFor(() =>
      expect(rejectResearchExportRequestMock).toHaveBeenCalledWith(9, {
        approval_comment: "缺少伦理审批编号，暂不批准"
      })
    );
    await waitFor(() => expect(screen.getAllByText("已驳回").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "下载脱敏数据包 #9" })).not.toBeInTheDocument();
  });

  it("filters export requests by purpose id and approval status", async () => {
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByRole("heading", { name: "数据导出审批" })).toBeInTheDocument();
    const requestList = screen.getByLabelText("导出申请列表");
    expect(within(requestList).getByText("高血压人群依从性差异分析")).toBeInTheDocument();
    expect(within(requestList).getByText("阶段效果分析")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索申请人/编号..."), { target: { value: "阶段" } });
    expect(within(requestList).queryByText("高血压人群依从性差异分析")).not.toBeInTheDocument();
    expect(within(requestList).getByText("阶段效果分析")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("申请状态筛选"), { target: { value: "PENDING" } });
    expect(screen.getByText("当前筛选条件下没有导出申请。")).toBeInTheDocument();
  });

  it("logs out from the researcher portal shell", async () => {
    renderResearchRoute("/research/dashboard");

    expect(await screen.findByRole("heading", { name: "宏观统计大盘" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledWith("refresh-token"));
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(localStorage.getItem("current_user_role")).toBeNull();
  });
});
