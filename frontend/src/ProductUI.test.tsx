import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  AppShell,
  ChartCard,
  ClinicalSummaryStrip,
  DataWorkbench,
  EmptyState,
  EvidenceTimeline,
  FormDrawer,
  MetricCard,
  RiskStatusPanel
} from "./components/ProductUI";

describe("Product UI system", () => {
  it("renders a complete role shell with active navigation and workspace context", () => {
    localStorage.setItem("current_user_role", "ADMIN");
    localStorage.setItem("current_user_name", "运营管理员");
    localStorage.setItem("current_organization_name", "河南体育学院运动促进健康中心");

    render(
      <MemoryRouter initialEntries={["/admin/knowledge"]}>
        <AppShell role="admin" title="知识库管理" subtitle="切片、向量化和检索验证">
          <div>页面主体</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByText("启衡")).toBeInTheDocument();
    expect(screen.getByText("运营管理员")).toBeInTheDocument();
    expect(screen.getByText("河南体育学院运动促进健康中心")).toBeInTheDocument();
    expect(screen.getByText("切片、向量化和检索验证")).toBeInTheDocument();

    const knowledgeLink = screen.getByRole("link", { name: /知识库/ });
    expect(knowledgeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /动作/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /科研审批/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /审计/ })).toBeInTheDocument();
  });

  it("highlights query based navigation items and renders breadcrumb context", () => {
    render(
      <MemoryRouter initialEntries={["/expert/reviews?panel=evidence"]}>
        <AppShell role="expert" title="证据核验" subtitle="规则、模板和 RAG 来源">
          <div>证据主体</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("当前位置")).toHaveTextContent("专家端");
    expect(screen.getByLabelText("当前位置")).toHaveTextContent("专家审核队列");
    expect(screen.getByRole("heading", { name: "证据核验" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /审核/ }).some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getByRole("link", { name: /分诊看板/ })).not.toHaveAttribute("aria-current", "page");
  });

  it("shows a nearby mobile-safe back path for secondary pages", () => {
    render(
      <MemoryRouter initialEntries={["/user/prescriptions"]}>
        <AppShell role="user" title="处方发布面板">
          <div>处方主体</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "返回今日通行证" })).toHaveAttribute("href", "/user/dashboard");
  });

  it("keeps summary strips to three clinical states and exposes workbench structure", () => {
    render(
      <MemoryRouter>
        <ClinicalSummaryStrip>
          <div>风险等级</div>
          <div>审核状态</div>
          <div>运动闸口</div>
          <div>额外状态</div>
        </ClinicalSummaryStrip>
        <DataWorkbench
          filters={<label htmlFor="queue-filter">筛选</label>}
          main={<div>主任务表格</div>}
          detail={<div>选中任务预览</div>}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("风险等级")).toBeInTheDocument();
    expect(screen.getByText("审核状态")).toBeInTheDocument();
    expect(screen.getByText("运动闸口")).toBeInTheDocument();
    expect(screen.queryByText("额外状态")).not.toBeInTheDocument();
    expect(screen.getByLabelText("数据工作台")).toBeInTheDocument();
    expect(screen.getByText("主任务表格")).toBeInTheDocument();
    expect(screen.getByText("选中任务预览")).toBeInTheDocument();
  });

  it("renders metric trends, sparklines and risk safety panels", () => {
    render(
      <MemoryRouter>
        <MetricCard
          title="周完成率"
          value={82}
          suffix="%"
          trend="up"
          trendLabel="较上周 +8%"
          sparkline={[56, 62, 68, 82]}
        />
        <RiskStatusPanel level="R2" title="专家审核中" />
      </MemoryRouter>
    );

    expect(screen.getByText("较上周 +8%")).toBeInTheDocument();
    expect(screen.getByLabelText("周完成率 微型趋势图")).toBeInTheDocument();
    expect(screen.getByText("专家审核中")).toBeInTheDocument();
    expect(screen.getByText(/审核前不展示开始训练入口/)).toBeInTheDocument();
  });

  it("renders chart card state wrappers and evidence timeline items", () => {
    render(
      <MemoryRouter>
        <ChartCard title="规则命中排行" error="图表接口失败">
          <div>不会展示</div>
        </ChartCard>
        <EvidenceTimeline
          items={[
            { title: "RAG 证据", description: "高血压运动指南", status: "done" },
            { title: "规则命中", description: "R2 高血压规则", status: "active" }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("图表接口失败")).toBeInTheDocument();
    expect(screen.queryByText("不会展示")).not.toBeInTheDocument();
    expect(screen.getByText("RAG 证据")).toBeInTheDocument();
    expect(screen.getByText("规则命中")).toBeInTheDocument();
  });

  it("renders chart decision metadata and empty recovery paths", () => {
    render(
      <MemoryRouter>
        <ChartCard
          title="反馈完成率趋势"
          unit="%"
          insight="用于判断是否需要调整处方依从性策略。"
          threshold="低于 60% 需要专家复核执行障碍。"
          empty
          emptyReason="当前筛选范围内没有反馈记录。"
          action={<button type="button">查看反馈明细</button>}
        >
          <div>不会展示</div>
        </ChartCard>
        <EmptyState
          title="暂无导出任务"
          description="还没有科研导出申请。"
          action={<button type="button">新建导出申请</button>}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("单位：%")).toBeInTheDocument();
    expect(screen.getByText("用于判断是否需要调整处方依从性策略。")).toBeInTheDocument();
    expect(screen.getByText("低于 60% 需要专家复核执行障碍。")).toBeInTheDocument();
    expect(screen.getByText("当前筛选范围内没有反馈记录。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看反馈明细" })).toBeInTheDocument();
    expect(screen.getByText("暂无导出任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建导出申请" })).toBeInTheDocument();
  });

  it("renders chart panels and form drawers without forcing card wrappers", () => {
    render(
      <MemoryRouter>
        <ChartCard
          title="分型分布"
          insight="用于查看脱敏分型结构。"
          dataRows={[
            { label: "心肺改善型", values: [{ label: "样本", value: 12 }] },
            { label: "代谢风险型", values: [{ label: "样本", value: 8 }] }
          ]}
        >
          <div>图表主体</div>
        </ChartCard>
        <FormDrawer title="分组抽屉" open onClose={() => undefined} actions={<button type="button">保存</button>}>
          <section>基础信息</section>
        </FormDrawer>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("分型分布")).toHaveClass("chart-panel");
    expect(screen.getByText("查看数据")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(document.querySelector(".chart-panel.ant-card")).not.toBeInTheDocument();
  });

  it("keeps the complete evidence chain available behind an explicit expansion", () => {
    render(
      <MemoryRouter>
        <EvidenceTimeline
          items={[
            {
              title: "RAG 证据",
              description: "高血压运动指南",
              status: "done",
              details: [
                { label: "来源", value: "ACSM 指南" },
                { label: "章节", value: "第 6 章 · 高血压运动处方" },
                { label: "Chunk", value: "chunk-17" },
                { label: "检索方式", value: "vector+keyword" },
                { label: "引用", value: "中等强度有氧运动前需评估血压控制情况。" }
              ]
            }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("chunk-17")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开完整证据链" }));

    expect(screen.getByText("来源")).toBeInTheDocument();
    expect(screen.getByText("ACSM 指南")).toBeInTheDocument();
    expect(screen.getByText("章节")).toBeInTheDocument();
    expect(screen.getByText("chunk-17")).toBeInTheDocument();
    expect(screen.getByText("vector+keyword")).toBeInTheDocument();
    expect(screen.getByText(/中等强度有氧运动前需评估血压控制情况/)).toBeInTheDocument();
  });

  it("disables non-essential motion when reduced motion is preferred", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    Object.defineProperty(window, "matchMedia", { writable: true, value: matchMedia });

    render(
      <MemoryRouter>
        <MetricCard title="周完成率" value={82} suffix="%" />
      </MemoryRouter>
    );

    expect(screen.getByText("周完成率").closest("[data-motion]")).toHaveAttribute("data-motion", "reduced");
  });
});
