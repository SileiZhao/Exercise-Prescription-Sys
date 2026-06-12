import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const readySummary = {
  total_users: 12,
  users_by_role: { USER: 8, EXPERT: 2, ADMIN: 1, RESEARCHER: 1 },
  risk_distribution: { R1: 5, R2: 4, R3: 1 },
  prescription_status: { PUBLISHED: 6, PENDING_REVIEW: 3, REFERRED: 1 },
  review_stats: { pending: 3, approved: 5, rejected: 1, referred: 1 },
  r2_review_rate: 1,
  r3_referral_count: 1,
  feedback_stats: { total: 20, average_completion_rate: 82.5 },
  template_usage: { total_templates: 10, approved_templates: 7 },
  prescription_trend: [
    { date: "2026-06-01", generated: 8, published: 5 },
    { date: "2026-06-02", generated: 10, published: 7 }
  ],
  rule_hit_rank: [
    { rule: "RISK_BP", count: 9 },
    { rule: "RISK_PAIN", count: 4 }
  ],
  template_usage_rank: [
    { template: "高血压稳定型", count: 6 },
    { template: "体重管理型", count: 3 }
  ],
  cluster_distribution: { 肥胖代谢风险型: 4, 心肺功能不足型: 3 },
  reference_data_status: {
    risk_rules: { total: 78, active: 78 },
    actions: { approved: 98, pending_review: 12 },
    approved_actions_count: 98,
    pending_actions_count: 12,
    compliance: { confirmed: 8, draft: 0 },
    confirmed_compliance_count: 8,
    draft_compliance_count: 0,
    templates: { total: 16, approved: 16 },
    knowledge: { documents: 53, skipped_documents: 0, failed_documents: 2, chunks: 12050, indexed_chunks: 12050 },
    rag_active_documents_count: 53,
    rag_skipped_documents_count: 0,
    rag_failed_documents_count: 2,
    llm: { provider: "aliyun", model: "qwen3.7-max", production_ready: true, status: "ok" },
    embedding: { provider: "dashscope", model: "text-embedding-v4", production_ready: true, status: "ok" },
    ocr: { provider: "paddleocr", enabled: true, status: "ok" },
    embedding_provider: "dashscope",
    ocr_enabled: true,
    llm_provider: "aliyun",
    ollama_ready: false
  }
};

const getAdminDashboardSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("./api/adminDashboard", () => ({
  getAdminDashboardSummary: getAdminDashboardSummaryMock
}));

describe("admin dashboard", () => {
  beforeEach(() => {
    getAdminDashboardSummaryMock.mockResolvedValue(readySummary);
  });

  it("renders operational and safety statistics", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter
        initialEntries={["/admin/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "运营指挥台" })).toBeInTheDocument();
    expect(screen.getByText("启衡")).toBeInTheDocument();
    const kpiStrip = screen.getByTestId("admin-kpi-strip");
    expect(kpiStrip.querySelectorAll(".status-tile")).toHaveLength(3);
    expect(within(kpiStrip).getByText("上线阻断")).toBeInTheDocument();
    expect(within(kpiStrip).getByText("R2 审核积压")).toBeInTheDocument();
    expect(within(kpiStrip).getByText("R3 转介")).toBeInTheDocument();
    expect(within(kpiStrip).getByText("LLM / Embedding / OCR / RAG")).toBeInTheDocument();
    expect(within(kpiStrip).queryByText("处方生成数")).not.toBeInTheDocument();
    expect(within(kpiStrip).queryByText("专家审核数")).not.toBeInTheDocument();
    expect(within(kpiStrip).queryByText("R2平均审核时长")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-command-center")).toBeInTheDocument();
    expect(screen.getByText("运营指挥摘要")).toBeInTheDocument();
    expect(screen.getByText("试点处方流转")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("发布 6") && content.includes("生成 10"))).toBeInTheDocument();
    expect(screen.getByText("R2 审核 100%")).toBeInTheDocument();
    expect(screen.getByText("安全上线闸口")).toBeInTheDocument();
    expect(screen.getByText("LLM aliyun")).toBeInTheDocument();
    expect(screen.getByText("RAG 12050 / 12050")).toBeInTheDocument();
    expect(screen.getByText("模型与资料状态")).toBeInTheDocument();
    expect(screen.getByText("动作 98 已审核 / 12 待审核")).toBeInTheDocument();
    expect(screen.getByText("模板 16 / 16")).toBeInTheDocument();
    expect(screen.getByText("风险分布")).toBeInTheDocument();
    expect(await screen.findByTestId("RiskDistributionChart-echart")).toBeInTheDocument();
    expect(await screen.findByTestId("ExpertQueueChart-echart")).toBeInTheDocument();
    expect(await screen.findByTestId("RuleHitRankChart-echart")).toBeInTheDocument();
    // Analysis charts are grouped into tabs; default "安全与审核" tab shows 3 charts only.
    expect(document.querySelectorAll(".chart-panel")).toHaveLength(3);
    expect(screen.queryByTestId("ClusterScatterChart-echart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("TemplateUsageChart-echart")).not.toBeInTheDocument();
    // Switch to business-flow tab to reveal the prescription trend chart.
    fireEvent.click(screen.getByRole("tab", { name: "业务流转" }));
    expect(await screen.findByTestId("PrescriptionTrendChart-echart")).toBeInTheDocument();
    // Switch to model tab for the governance summaries.
    fireEvent.click(screen.getByRole("tab", { name: "资料与模型" }));
    expect(await screen.findByText("模板使用摘要")).toBeInTheDocument();
    expect(screen.getByText("分型模型摘要")).toBeInTheDocument();
    // Reference-data status now lives in its own tab.
    fireEvent.click(screen.getByRole("tab", { name: "上线资料状态" }));
    expect(await screen.findByText("规则库")).toBeInTheDocument();
    expect(screen.getByText("78 / 78")).toBeInTheDocument();
	    expect(screen.getAllByText("动作库").length).toBeGreaterThan(0);
	    expect(screen.getByText("98 已审核 / 12 待审核")).toBeInTheDocument();
	    expect(screen.getByText("已批准动作")).toBeInTheDocument();
	    expect(screen.getByText("RAG 跳过文档")).toBeInTheDocument();
	    expect(screen.getByText("RAG 索引失败文档")).toBeInTheDocument();
	    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
	    expect(screen.getAllByText("模板库").length).toBeGreaterThan(0);
	    expect(screen.getByText("16 / 16")).toBeInTheDocument();
	    expect(screen.getByText("RAG")).toBeInTheDocument();
	    expect(screen.getByText("53 文档 / 12050 切片 / 12050 已索引")).toBeInTheDocument();
	    expect(screen.getByText("Embedding")).toBeInTheDocument();
	    expect(screen.getByText("dashscope / text-embedding-v4")).toBeInTheDocument();
	    expect(screen.getByText("OCR")).toBeInTheDocument();
	    expect(screen.getByText("paddleocr，已启用")).toBeInTheDocument();
	    expect(screen.getByText("LLM")).toBeInTheDocument();
	    expect(screen.getByText("aliyun / qwen3.7-max，生产可用")).toBeInTheDocument();
	    expect(screen.getByText("上线就绪")).toBeInTheDocument();
	    expect(screen.queryByText("RAG 索引未完成：12050 / 12050 切片")).not.toBeInTheDocument();
	  });

  it("renders blocking readiness reasons for LLM OCR and RAG index gaps", async () => {
    getAdminDashboardSummaryMock.mockResolvedValueOnce({
      ...readySummary,
      reference_data_status: {
        ...readySummary.reference_data_status,
        knowledge: { documents: 53, skipped_documents: 3, chunks: 12050, indexed_chunks: 12049 },
        rag_skipped_documents_count: 3,
        llm: { provider: "ollama", model: "gemma3:latest", production_ready: false, status: "not_ready" },
        ocr: { provider: "paddleocr", enabled: false, status: "disabled" }
      }
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter
        initialEntries={["/admin/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("上线阻断")).length).toBeGreaterThan(0);
    const kpiStrip = screen.getByTestId("admin-kpi-strip");
    const blockingMetric = within(kpiStrip).getByText("上线阻断").closest(".status-tile") as HTMLElement;
    expect(within(blockingMetric).getByText("4")).toBeInTheDocument();
    expect(within(blockingMetric).getByText("LLM / Embedding / OCR / RAG")).toBeInTheDocument();
    expect(screen.getAllByText("LLM 未达到生产可用状态").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OCR 未启用，资料入库链路不可用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RAG 存在 3 份跳过文档").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RAG 索引未完成：12049 / 12050 切片").length).toBeGreaterThan(0);
  });
});
