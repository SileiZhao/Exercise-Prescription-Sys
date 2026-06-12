import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  AppShell,
  ChartCard,
  ClinicalScopePanel,
  DemoDataBanner,
  EvidenceTimeline,
  MetricCard,
  RiskStatusPanel,
  SafetyBoundaryChecklist
} from "./components/ProductUI";

describe("Product UI system", () => {
  it("renders the clinical launch scope and hard safety boundary", () => {
    render(
      <MemoryRouter>
        <ClinicalScopePanel compact />
        <SafetyBoundaryChecklist compact />
      </MemoryRouter>
    );

    expect(screen.getByText("默认上线边界")).toBeInTheDocument();
    expect(screen.getAllByText(/成人一般健康/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/慢病风险管理/).length).toBeGreaterThan(0);
    expect(screen.getByText(/儿童 转介/)).toBeInTheDocument();
    expect(screen.getByText(/高危心血管事件 转介/)).toBeInTheDocument();
    expect(screen.getByText(/中风险审核通过前不展示训练动作/)).toBeInTheDocument();
    expect(screen.getByText(/高风险仅展示医学评估/)).toBeInTheDocument();
  });

  it("renders a complete role shell with active navigation, demo banner and workspace context", () => {
    localStorage.setItem("current_user_role", "ADMIN");
    localStorage.setItem("current_user_name", "演示管理员");
    localStorage.setItem("current_organization_name", "河南体育学院运动促进健康示范中心");

    render(
      <MemoryRouter initialEntries={["/admin/knowledge"]}>
        <AppShell role="admin" title="知识库管理" subtitle="切片、向量化和检索验证">
          <div>页面主体</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByText("当前为示范数据")).toBeInTheDocument();
    expect(screen.getByText("演示管理员")).toBeInTheDocument();
    expect(screen.getByText("河南体育学院运动促进健康示范中心")).toBeInTheDocument();
    expect(screen.getByText("切片、向量化和检索验证")).toBeInTheDocument();
    expect(screen.getByTestId("page-header-title-block")).toBeInTheDocument();
    expect(screen.getByTestId("page-header-meta")).toBeInTheDocument();

    const knowledgeLink = screen.getByRole("link", { name: /知识库/ });
    expect(knowledgeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /动作/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /科研导出/ })).toBeInTheDocument();
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
    expect(screen.getByLabelText("当前位置")).toHaveTextContent("当前页");
    expect(screen.getByRole("heading", { name: "证据核验" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /证据/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /审核/ })).not.toHaveAttribute("aria-current", "page");
  });

  it("renders metric trends, sparklines, count-up numbers and risk safety panels", async () => {
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

    const countUp = screen.getByTestId("count-up-number");
    expect(countUp).toHaveAttribute("data-count-up", "82");
    expect(countUp.textContent).toMatch(/%$/);
    expect(screen.getByTestId("metric-final-value")).toHaveTextContent("82%");
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("较上周 +8%")).toBeInTheDocument();
    expect(screen.getByLabelText("周完成率 微型趋势图")).toBeInTheDocument();
    expect(screen.getByText("专家审核中")).toBeInTheDocument();
    expect(screen.getByText(/审核前不展示开始训练入口/)).toBeInTheDocument();
  });

  it("renders final metric numbers immediately when reduced motion is preferred", () => {
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
        <MetricCard title="处方发布" value={36} suffix="份" />
      </MemoryRouter>
    );

    const countUp = screen.getByTestId("count-up-number");
    expect(countUp).toHaveAttribute("data-motion", "reduced");
    expect(countUp).toHaveTextContent("36份");
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
        <DemoDataBanner />
      </MemoryRouter>
    );

    const banner = screen.getByText("当前为示范数据").closest(".demo-data-banner");
    expect(banner).toHaveAttribute("data-motion", "reduced");

    fireEvent.mouseEnter(screen.getByText("当前为示范数据"));
    expect(screen.getByText(/仅用于演示/)).toBeInTheDocument();
  });
});
