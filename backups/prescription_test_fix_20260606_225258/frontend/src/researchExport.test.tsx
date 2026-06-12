import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const createResearchExportRequestMock = vi.hoisted(() => vi.fn((payload: { format: "csv" | "xlsx" | "json"; purpose: string }) => Promise.resolve({
  id: 7,
  requested_by: 2,
  format: payload.format,
  purpose: payload.purpose,
  status: "PENDING",
  approved_by: null,
  approval_comment: null,
  row_count: 1,
  expires_at: null,
  downloaded_at: null,
  created_at: "2026-06-03T00:00:00"
})));
const downloadResearchExportRequestMock = vi.hoisted(() => vi.fn().mockResolvedValue(new Blob(["participant_code"], { type: "text/csv" })));
const approveResearchExportRequestMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: 9,
  requested_by: 3,
  format: "json",
  purpose: "管理员待审批",
  status: "APPROVED",
  approved_by: 1,
  approval_comment: "同意用于课题结题分析",
  row_count: 2,
  expires_at: "2026-06-04T12:00:00",
  downloaded_at: null,
  created_at: "2026-06-03T00:00:00"
}));
const rejectResearchExportRequestMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: 9,
  requested_by: 3,
  format: "json",
  purpose: "管理员待审批",
  status: "REJECTED",
  approved_by: 1,
  approval_comment: "用途不清晰，需补充伦理编号",
  row_count: 2,
  expires_at: null,
  downloaded_at: null,
  created_at: "2026-06-03T00:00:00"
}));
const listResearchExportRequestsMock = vi.hoisted(() => vi.fn());
const getResearchSummaryMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  total_participants: 2,
  risk_distribution: { R1: 1, R2: 1 },
  cluster_distribution: { 肥胖代谢风险型: 1, 心肺功能不足型: 1 },
  cluster_risk_overlay: { 肥胖代谢风险型: { R2: 1 }, 心肺功能不足型: { R1: 1 } },
  prescription_status: { PUBLISHED: 1, PENDING_REVIEW: 1 },
  template_effects: { 减脂模板: 82, 心肺模板: 76 },
  export_job_status: { PENDING: 1, APPROVED: 1 },
  intervention_effects: {
    feedback_count: 4,
    average_completion_rate: 86.5,
    average_rpe: 12.25,
    discomfort_event_count: 1,
    pain_worsened_count: 0,
    completion_rate_trend: [
      { date: "第1周", value: 72 },
      { date: "第4周", value: 86.5 }
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
}));
const exportDesensitizedUsersMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  total: 1,
  items: [
    {
      research_subject_id: "RS-001",
      participant_code: "P000001",
      profile: {
        age: 36,
        sex: "男",
        bmi: 28.37,
        exercise_goal: ["减脂"],
        name: "真实姓名",
        mobile: "13800138000",
        email: "zhang@example.com",
        id_card: "110101199001011234"
      },
      fitness_test: { sbp: 128, dbp: 82, pain_score: 1 },
      risk_screening: { risk_level: "R1", risk_reasons: ["超重"] },
      latest_prescription: { status: "PUBLISHED", cluster_label: "肥胖代谢风险型" }
    }
  ]
}));

vi.mock("./api/researchExport", () => ({
  approveResearchExportRequest: approveResearchExportRequestMock,
  createResearchExportRequest: createResearchExportRequestMock,
  downloadResearchExportRequest: downloadResearchExportRequestMock,
  rejectResearchExportRequest: rejectResearchExportRequestMock,
  getResearchSummary: getResearchSummaryMock,
  exportDesensitizedUsers: exportDesensitizedUsersMock,
  listResearchExportRequests: listResearchExportRequestsMock
}));

function defaultResearchExportRequests() {
  return [
    {
      id: 9,
      requested_by: 3,
      organization_id: 1,
      format: "json",
      purpose: "管理员待审批",
      status: "PENDING",
      approved_by: null,
      approval_comment: null,
      row_count: 2,
      expires_at: null,
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    },
    {
      id: 8,
      requested_by: 2,
      organization_id: 1,
      format: "xlsx",
      purpose: "Excel 汇总",
      status: "APPROVED",
      approved_by: 1,
      approval_comment: "同意用于阶段分析",
      row_count: 1,
      expires_at: "2999-06-04T00:00:00",
      downloaded_at: null,
      created_at: "2026-06-03T00:00:00"
    },
    {
      id: 12,
      requested_by: 2,
      organization_id: 1,
      format: "csv",
      purpose: "CSV 已过期",
      status: "APPROVED",
      approved_by: 1,
      approval_comment: "同意但已超过下载窗口",
      row_count: 3,
      expires_at: "2000-01-01T00:00:00",
      downloaded_at: null,
      created_at: "2026-06-02T00:00:00"
    },
    {
      id: 13,
      requested_by: 2,
      organization_id: 1,
      format: "json",
      purpose: "JSON 已下载",
      status: "APPROVED",
      approved_by: 1,
      approval_comment: "同意用于结题归档",
      row_count: 4,
      expires_at: "2999-06-04T00:00:00",
      downloaded_at: "2026-06-04T09:30:00",
      created_at: "2026-06-02T00:00:00"
    }
  ];
}

function requestItemByPurpose(purpose: string) {
  const item = screen.getByText(purpose).closest(".ant-list-item");
  expect(item).not.toBeNull();
  return within(item as HTMLElement);
}

describe("research export page", () => {
  beforeEach(() => {
    createResearchExportRequestMock.mockClear();
    downloadResearchExportRequestMock.mockClear();
    approveResearchExportRequestMock.mockClear();
    rejectResearchExportRequestMock.mockClear();
    listResearchExportRequestsMock.mockReset();
    listResearchExportRequestsMock.mockResolvedValue(defaultResearchExportRequests());
    getResearchSummaryMock.mockClear();
    exportDesensitizedUsersMock.mockClear();
    localStorage.setItem("current_user_id", "2");
  });

  function renderResearchRoute(path: string) {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "RESEARCHER");

    render(
      <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );
  }

  it("renders the research dashboard with aggregate sections without calling the admin preview API", async () => {
    renderResearchRoute("/research/dashboard");

    expect(await screen.findByText("科研数据看板")).toBeInTheDocument();
    expect(screen.getByText("仅展示脱敏聚合数据")).toBeInTheDocument();
    expect(screen.getByText("脱敏样本量")).toBeInTheDocument();
    expect(screen.getByText("风险分布")).toBeInTheDocument();
    expect(screen.getByText("分型分布")).toBeInTheDocument();
    expect(screen.getByText("干预前后变化")).toBeInTheDocument();
    expect(screen.getByText("模板效果")).toBeInTheDocument();
    expect(screen.getByText("导出任务状态")).toBeInTheDocument();
    expect(screen.getByTestId("research-console-analytics")).toBeInTheDocument();
    expect(screen.getByText("风险/分型矩阵")).toBeInTheDocument();
    expect(screen.getByText("干预趋势摘要")).toBeInTheDocument();
    expect(screen.getByText("导出治理")).toBeInTheDocument();
    expect(screen.getByText("肥胖代谢风险型")).toBeInTheDocument();
    expect(screen.getByText("R2 1")).toBeInTheDocument();
    expect(screen.getByText("完成率 86.5%")).toBeInTheDocument();
    expect(screen.getByText("待审批 1")).toBeInTheDocument();
    expect(screen.queryByText("研究对象ID")).not.toBeInTheDocument();
    expect(screen.queryByText("RS-001")).not.toBeInTheDocument();
    expect(screen.queryByText("P000001")).not.toBeInTheDocument();
    expect(await screen.findByTestId("ClusterScatterChart-echart")).toBeInTheDocument();
    expect(await screen.findByTestId("StageEvaluationCompareChart-echart")).toBeInTheDocument();
    await waitFor(() => expect(exportDesensitizedUsersMock).not.toHaveBeenCalled());
    expect(screen.queryByText("真实姓名")).not.toBeInTheDocument();
    expect(screen.queryByText("13800138000")).not.toBeInTheDocument();
    expect(screen.queryByText("zhang@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("110101199001011234")).not.toBeInTheDocument();
  });

  it("renders cluster analysis with scatter chart, cluster statistics, risk overlay and cold-start guidance", async () => {
    renderResearchRoute("/research/cluster-analysis");

    expect(await screen.findByText("科研分型分析")).toBeInTheDocument();
    expect(await screen.findByTestId("ClusterScatterChart-echart")).toBeInTheDocument();
    expect(screen.getByText("分型统计")).toBeInTheDocument();
    expect(screen.getByText("风险叠加")).toBeInTheDocument();
    expect(screen.getByText("冷启动说明")).toBeInTheDocument();
    expect(screen.getByText(/肥胖代谢风险型/)).toBeInTheDocument();
    expect(screen.getByText(/R2/)).toBeInTheDocument();
  });

  it("renders intervention effects with stage comparison and completion RPE pain blood pressure glucose trends", async () => {
    renderResearchRoute("/research/intervention-effects");

    expect(await screen.findByText("科研干预效果")).toBeInTheDocument();
    expect(await screen.findByTestId("StageEvaluationCompareChart-echart")).toBeInTheDocument();
    expect(screen.getByText("完成率趋势")).toBeInTheDocument();
    expect(screen.getByText("RPE趋势")).toBeInTheDocument();
    expect(screen.getByText("疼痛趋势")).toBeInTheDocument();
    expect(screen.getByText("血压变化趋势")).toBeInTheDocument();
    expect(screen.getByText("血糖变化趋势")).toBeInTheDocument();
    expect(screen.getByTestId("BloodPressureTrendChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("BloodGlucoseTrendChart-echart")).toBeInTheDocument();
  });

  it("shows an explicit empty state when the backend omits trend aggregation fields", async () => {
    getResearchSummaryMock.mockResolvedValueOnce({
      total_participants: 2,
      risk_distribution: { R1: 1, R2: 1 },
      cluster_distribution: { 肥胖代谢风险型: 1, 心肺功能不足型: 1 },
      cluster_risk_overlay: { 肥胖代谢风险型: { R2: 1 }, 心肺功能不足型: { R1: 1 } },
      prescription_status: { PUBLISHED: 1, PENDING_REVIEW: 1 },
      template_effects: { 减脂模板: 82, 心肺模板: 76 },
      export_job_status: { PENDING: 1, APPROVED: 1 },
      intervention_effects: {
        feedback_count: 4,
        average_completion_rate: 86.5,
        average_rpe: 12.25,
        discomfort_event_count: 1,
        pain_worsened_count: 0
      }
    });

    renderResearchRoute("/research/intervention-effects");

    expect(await screen.findByText("科研干预效果")).toBeInTheDocument();
    const trendEmptyStates = await screen.findAllByText("当前后端未提供趋势聚合字段");
    expect(trendEmptyStates.length).toBeGreaterThanOrEqual(5);
  });

  it("renders export jobs as the researcher own requests with CSV Excel JSON creation and approved downloads", async () => {
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("科研导出任务")).toBeInTheDocument();
    expect(await screen.findByText("Excel 汇总")).toBeInTheDocument();
    expect(screen.queryByText("管理员待审批")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Excel" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "JSON" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("导出用途"), { target: { value: "Excel 阶段分析" } });
    fireEvent.change(screen.getByLabelText("导出格式"), { target: { value: "xlsx" } });
    fireEvent.click(screen.getByRole("button", { name: "提交导出申请" }));

    await waitFor(() =>
      expect(createResearchExportRequestMock).toHaveBeenCalledWith({
        format: "xlsx",
        purpose: "Excel 阶段分析"
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "下载 #8" }));
    await waitFor(() => expect(downloadResearchExportRequestMock).toHaveBeenCalledWith(8));
  });

  it("renders only researcher-owned export requests and explains non-owned requests are hidden", async () => {
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("科研导出任务")).toBeInTheDocument();
    expect(screen.getByText("Excel 汇总")).toBeInTheDocument();
    expect(screen.getByText("CSV 已过期")).toBeInTheDocument();
    expect(screen.getByText("JSON 已下载")).toBeInTheDocument();
    expect(screen.queryByText("管理员待审批")).not.toBeInTheDocument();
    expect(screen.getByText("非本人申请不可见")).toBeInTheDocument();
  });

  it("does not offer downloads for approved requests that are expired or already downloaded", async () => {
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("CSV 已过期")).toBeInTheDocument();
    expect(requestItemByPurpose("CSV 已过期").getByText("已过期")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 #12" })).not.toBeInTheDocument();

    expect(requestItemByPurpose("JSON 已下载").getByText("已下载")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 #13" })).not.toBeInTheDocument();
  });

  it("shows approval, expiry and download audit text for each export request", async () => {
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("Excel 汇总")).toBeInTheDocument();
    const downloadable = requestItemByPurpose("Excel 汇总");
    expect(downloadable.getByText("限时可下载")).toBeInTheDocument();
    expect(downloadable.getByText("审批意见：同意用于阶段分析")).toBeInTheDocument();
    expect(downloadable.getByText("过期时间：2999-06-04T00:00:00")).toBeInTheDocument();
    expect(downloadable.getByText("下载状态：未下载")).toBeInTheDocument();

    const expired = requestItemByPurpose("CSV 已过期");
    expect(expired.getByText("审批意见：同意但已超过下载窗口")).toBeInTheDocument();
    expect(expired.getByText("过期时间：2000-01-01T00:00:00")).toBeInTheDocument();
    expect(expired.getByText("下载状态：未下载")).toBeInTheDocument();

    const downloaded = requestItemByPurpose("JSON 已下载");
    expect(downloaded.getByText("审批意见：同意用于结题归档")).toBeInTheDocument();
    expect(downloaded.getByText("过期时间：2999-06-04T00:00:00")).toBeInTheDocument();
    expect(downloaded.getByText("下载状态：已下载")).toBeInTheDocument();
    expect(downloaded.getByText("下载时间：2026-06-04T09:30:00")).toBeInTheDocument();
  });

  it("refreshes export requests after downloading an approved active request", async () => {
    listResearchExportRequestsMock
      .mockResolvedValueOnce(defaultResearchExportRequests())
      .mockResolvedValueOnce(
        defaultResearchExportRequests().map((request) =>
          request.id === 8 ? { ...request, downloaded_at: "2026-06-05T10:00:00" } : request
        )
      );

    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("Excel 汇总")).toBeInTheDocument();
    expect(requestItemByPurpose("Excel 汇总").getByText("限时可下载")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载 #8" }));

    await waitFor(() => expect(downloadResearchExportRequestMock).toHaveBeenCalledWith(8));
    await waitFor(() => expect(listResearchExportRequestsMock).toHaveBeenCalledTimes(2));
    expect(requestItemByPurpose("Excel 汇总").getByText("下载状态：已下载")).toBeInTheDocument();
    expect(requestItemByPurpose("Excel 汇总").getByText("下载时间：2026-06-05T10:00:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 #8" })).not.toBeInTheDocument();
  });

  it("does not show export requests when researcher identity id is invalid", async () => {
    localStorage.setItem("current_user_id", "not-a-number");
    renderResearchRoute("/research/export-jobs");

    expect(await screen.findByText("科研导出任务")).toBeInTheDocument();
    expect(screen.queryByText("Excel 汇总")).not.toBeInTheDocument();
    expect(screen.queryByText("管理员待审批")).not.toBeInTheDocument();
    expect(screen.getByText("暂无导出申请")).toBeInTheDocument();
  });

  it("renders desensitized export and intervention statistics", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "RESEARCHER");

    render(
      <MemoryRouter initialEntries={["/research/export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("科研脱敏导出")).toBeInTheDocument();
    expect(screen.getByText("AI 运动处方")).toBeInTheDocument();
    expect(screen.getByText("脱敏样本量")).toBeInTheDocument();
    expect(screen.getByText("平均完成率")).toBeInTheDocument();
    expect(screen.getByText("分型统计")).toBeInTheDocument();
    expect(screen.getByText("干预效果")).toBeInTheDocument();
    expect(screen.getAllByTestId("RiskDistributionChart-echart").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("ClusterScatterChart-echart")).toBeInTheDocument();
    expect(screen.getByTestId("StageEvaluationCompareChart-echart")).toBeInTheDocument();
    expect(screen.queryByText("P000001")).not.toBeInTheDocument();
    await waitFor(() => expect(exportDesensitizedUsersMock).not.toHaveBeenCalled());
    expect(screen.queryByText("真实姓名")).not.toBeInTheDocument();
  });

  it("creates export requests and downloads approved files", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "RESEARCHER");

    render(
      <MemoryRouter initialEntries={["/research/export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("导出申请")).toBeInTheDocument();
    expect(screen.getAllByText("APPROVED").length).toBeGreaterThanOrEqual(1);
    fireEvent.change(screen.getByLabelText("导出用途"), { target: { value: "阶段分析" } });
    fireEvent.change(screen.getByLabelText("导出格式"), { target: { value: "csv" } });
    fireEvent.click(screen.getByRole("button", { name: "提交导出申请" }));

    await waitFor(() =>
      expect(createResearchExportRequestMock).toHaveBeenCalledWith({
        format: "csv",
        purpose: "阶段分析"
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "下载 #8" }));
    await waitFor(() => expect(downloadResearchExportRequestMock).toHaveBeenCalledWith(8));
  });

  it("creates export requests for CSV Excel and JSON formats", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "RESEARCHER");

    render(
      <MemoryRouter initialEntries={["/research/export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("导出申请")).toBeInTheDocument();

    for (const [format, purpose] of [
      ["csv", "CSV 阶段分析"],
      ["xlsx", "Excel 阶段分析"],
      ["json", "JSON 阶段分析"]
    ] as const) {
      fireEvent.change(screen.getByLabelText("导出用途"), { target: { value: purpose } });
      fireEvent.change(screen.getByLabelText("导出格式"), { target: { value: format } });
      fireEvent.click(screen.getByRole("button", { name: "提交导出申请" }));
      await waitFor(() => expect(createResearchExportRequestMock).toHaveBeenCalledWith({ format, purpose }));
    }
  });

  it("shows approval and rejection entries on the admin research export route", async () => {
    localStorage.setItem("access_token", "admin-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter initialEntries={["/admin/research-export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("科研导出审批")).toBeInTheDocument();
    expect(await screen.findByText("管理员待审批")).toBeInTheDocument();
    expect(screen.getByTestId("research-desensitized-table")).toBeInTheDocument();
    expect(screen.getAllByText("研究对象ID").length).toBeGreaterThan(0);
    expect(screen.getByText("RS-001")).toBeInTheDocument();
    expect(screen.getByText("P000001")).toBeInTheDocument();
    expect(exportDesensitizedUsersMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "批准 #9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "驳回 #9" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("审批意见 #9"), { target: { value: "同意用于课题结题分析" } });
    fireEvent.click(screen.getByRole("button", { name: "批准 #9" }));

    await waitFor(() =>
      expect(approveResearchExportRequestMock).toHaveBeenCalledWith(9, {
        approval_comment: "同意用于课题结题分析"
      })
    );
  });

  it("rejects pending export requests from the admin research export route", async () => {
    localStorage.setItem("access_token", "admin-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter initialEntries={["/admin/research-export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("科研导出审批")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("审批意见 #9"), { target: { value: "用途不清晰，需补充伦理编号" } });
    fireEvent.click(screen.getByRole("button", { name: "驳回 #9" }));

    await waitFor(() =>
      expect(rejectResearchExportRequestMock).toHaveBeenCalledWith(9, {
        approval_comment: "用途不清晰，需补充伦理编号"
      })
    );
  });

  it("does not show approval actions on the researcher page", async () => {
    localStorage.setItem("access_token", "researcher-token");
    localStorage.setItem("current_user_role", "RESEARCHER");

    render(
      <MemoryRouter initialEntries={["/research/export"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("科研脱敏导出")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /批准 #/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /驳回 #/ })).not.toBeInTheDocument();
  });
});
