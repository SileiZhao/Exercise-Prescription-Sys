import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AdherenceChart,
  BloodGlucoseTrendChart,
  BloodPressureTrendChart,
  ClusterScatterChart,
  ExpertQueueChart,
  FeedbackTrendChart,
  HealthRadarChart,
  PrescriptionTrendChart,
  RiskDistributionChart,
  RuleHitRankChart,
  StageEvaluationCompareChart,
  TemplateUsageChart
} from "./components/charts";

const setOptionMock = vi.hoisted(() => vi.fn());
const disposeMock = vi.hoisted(() => vi.fn());
const resizeMock = vi.hoisted(() => vi.fn());

vi.mock("echarts", () => ({
  init: vi.fn(() => ({
    setOption: setOptionMock,
    dispose: disposeMock,
    resize: resizeMock
  }))
}));

type ChartCase = {
  name: string;
  testId: string;
  renderLoading: () => ReactElement;
  renderEmpty: () => ReactElement;
  renderError: () => ReactElement;
  renderNormal: () => ReactElement;
};

const chartCases: ChartCase[] = [
  {
    name: "RiskDistributionChart",
    testId: "RiskDistributionChart-echart",
    renderLoading: () => <RiskDistributionChart data={[{ name: "R1", value: 12 }]} loading />,
    renderEmpty: () => <RiskDistributionChart data={[]} />,
    renderError: () => <RiskDistributionChart data={[{ name: "R1", value: 12 }]} error="加载失败" />,
    renderNormal: () => <RiskDistributionChart data={[{ name: "R1", value: 12 }]} />
  },
  {
    name: "PrescriptionTrendChart",
    testId: "PrescriptionTrendChart-echart",
    renderLoading: () => <PrescriptionTrendChart data={[{ date: "2026-06-01", generated: 8, approved: 5 }]} loading />,
    renderEmpty: () => <PrescriptionTrendChart data={[]} />,
    renderError: () => <PrescriptionTrendChart data={[{ date: "2026-06-01", generated: 8, approved: 5 }]} error="加载失败" />,
    renderNormal: () => <PrescriptionTrendChart data={[{ date: "2026-06-01", generated: 8, approved: 5 }]} />
  },
  {
    name: "AdherenceChart",
    testId: "AdherenceChart-echart",
    renderLoading: () => <AdherenceChart data={[{ label: "第1周", completionRate: 72, targetRate: 80 }]} loading />,
    renderEmpty: () => <AdherenceChart data={[]} />,
    renderError: () => <AdherenceChart data={[{ label: "第1周", completionRate: 72, targetRate: 80 }]} error="加载失败" />,
    renderNormal: () => <AdherenceChart data={[{ label: "第1周", completionRate: 72, targetRate: 80 }]} />
  },
  {
    name: "RuleHitRankChart",
    testId: "RuleHitRankChart-echart",
    renderLoading: () => <RuleHitRankChart data={[{ rule: "高血压", count: 9 }]} loading />,
    renderEmpty: () => <RuleHitRankChart data={[]} />,
    renderError: () => <RuleHitRankChart data={[{ rule: "高血压", count: 9 }]} error="加载失败" />,
    renderNormal: () => <RuleHitRankChart data={[{ rule: "高血压", count: 9 }]} />
  },
  {
    name: "HealthRadarChart",
    testId: "HealthRadarChart-echart",
    renderLoading: () => <HealthRadarChart data={[{ metric: "心肺", value: 68, max: 100 }]} loading />,
    renderEmpty: () => <HealthRadarChart data={[]} />,
    renderError: () => <HealthRadarChart data={[{ metric: "心肺", value: 68, max: 100 }]} error="加载失败" />,
    renderNormal: () => <HealthRadarChart data={[{ metric: "心肺", value: 68, max: 100 }]} />
  },
  {
    name: "FeedbackTrendChart",
    testId: "FeedbackTrendChart-echart",
    renderLoading: () => <FeedbackTrendChart data={[{ date: "2026-06-01", rpe: 12, pain: 2, completionRate: 80 }]} loading />,
    renderEmpty: () => <FeedbackTrendChart data={[]} />,
    renderError: () => <FeedbackTrendChart data={[{ date: "2026-06-01", rpe: 12, pain: 2, completionRate: 80 }]} error="加载失败" />,
    renderNormal: () => <FeedbackTrendChart data={[{ date: "2026-06-01", rpe: 12, pain: 2, completionRate: 80 }]} />
  },
  {
    name: "ClusterScatterChart",
    testId: "ClusterScatterChart-echart",
    renderLoading: () => <ClusterScatterChart data={[{ x: 22.5, y: 78, cluster: "A", label: "用户A" }]} loading />,
    renderEmpty: () => <ClusterScatterChart data={[]} />,
    renderError: () => <ClusterScatterChart data={[{ x: 22.5, y: 78, cluster: "A", label: "用户A" }]} error="加载失败" />,
    renderNormal: () => <ClusterScatterChart data={[{ x: 22.5, y: 78, cluster: "A", label: "用户A" }]} />
  },
  {
    name: "StageEvaluationCompareChart",
    testId: "StageEvaluationCompareChart-echart",
    renderLoading: () => <StageEvaluationCompareChart data={[{ metric: "完成率", current: 78, previous: 64 }]} loading />,
    renderEmpty: () => <StageEvaluationCompareChart data={[]} />,
    renderError: () => <StageEvaluationCompareChart data={[{ metric: "完成率", current: 78, previous: 64 }]} error="加载失败" />,
    renderNormal: () => <StageEvaluationCompareChart data={[{ metric: "完成率", current: 78, previous: 64 }]} />
  },
  {
    name: "TemplateUsageChart",
    testId: "TemplateUsageChart-echart",
    renderLoading: () => <TemplateUsageChart data={[{ template: "高血压稳定型", count: 18 }]} loading />,
    renderEmpty: () => <TemplateUsageChart data={[]} />,
    renderError: () => <TemplateUsageChart data={[{ template: "高血压稳定型", count: 18 }]} error="加载失败" />,
    renderNormal: () => <TemplateUsageChart data={[{ template: "高血压稳定型", count: 18 }]} />
  },
  {
    name: "ExpertQueueChart",
    testId: "ExpertQueueChart-echart",
    renderLoading: () => <ExpertQueueChart data={[{ status: "待审核", count: 7 }]} loading />,
    renderEmpty: () => <ExpertQueueChart data={[]} />,
    renderError: () => <ExpertQueueChart data={[{ status: "待审核", count: 7 }]} error="加载失败" />,
    renderNormal: () => <ExpertQueueChart data={[{ status: "待审核", count: 7 }]} />
  },
  {
    name: "BloodPressureTrendChart",
    testId: "BloodPressureTrendChart-echart",
    renderLoading: () => <BloodPressureTrendChart data={[{ date: "基线", sbp: 136, dbp: 88 }]} loading />,
    renderEmpty: () => <BloodPressureTrendChart data={[]} />,
    renderError: () => <BloodPressureTrendChart data={[{ date: "基线", sbp: 136, dbp: 88 }]} error="加载失败" />,
    renderNormal: () => <BloodPressureTrendChart data={[{ date: "基线", sbp: 136, dbp: 88 }]} />
  },
  {
    name: "BloodGlucoseTrendChart",
    testId: "BloodGlucoseTrendChart-echart",
    renderLoading: () => <BloodGlucoseTrendChart data={[{ date: "基线", value: 6.2 }]} loading />,
    renderEmpty: () => <BloodGlucoseTrendChart data={[]} />,
    renderError: () => <BloodGlucoseTrendChart data={[{ date: "基线", value: 6.2 }]} error="加载失败" />,
    renderNormal: () => <BloodGlucoseTrendChart data={[{ date: "基线", value: 6.2 }]} />
  }
];

describe("ECharts chart components", () => {
  it.each(chartCases)("$name renders loading, empty, error and normal chart states", async (chart) => {
    const { rerender } = render(chart.renderLoading());
    expect(screen.getByRole("status")).toHaveTextContent("图表加载中");

    rerender(chart.renderEmpty());
    expect(screen.getByText("暂无图表数据")).toBeInTheDocument();

    rerender(chart.renderError());
    expect(screen.getByText("加载失败")).toBeInTheDocument();

    rerender(chart.renderNormal());
    expect(screen.getByTestId(chart.testId)).toBeInTheDocument();
    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
  });

  it("resizes chart instances when the viewport changes", async () => {
    render(<RiskDistributionChart data={[{ name: "R2", value: 6 }]} />);

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    window.dispatchEvent(new Event("resize"));

    expect(resizeMock).toHaveBeenCalled();
  });

  it("normalizes health radar values to a 0-100 display scale", async () => {
    render(
      <HealthRadarChart
        data={[
          { metric: "收缩压", value: 134, max: 180 },
          { metric: "连续运动", value: 7, max: 14 }
        ]}
      />
    );

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    expect(setOptionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        radar: expect.objectContaining({
          indicator: [
            { name: "收缩压", max: 100 },
            { name: "连续运动", max: 100 }
          ]
        }),
        series: [
          expect.objectContaining({
            data: [{ name: "当前", value: [74.4, 50] }]
          })
        ]
      }),
      true
    );
  });

  it("renders risk distribution as a fixed R0-R3 horizontal bar chart", async () => {
    setOptionMock.mockClear();
    render(<RiskDistributionChart data={[{ name: "R2", value: 4 }, { name: "R0", value: 10 }]} />);

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    const option = setOptionMock.mock.calls.at(-1)?.[0] as any;

    expect(option.series[0].type).toBe("bar");
    expect(option.yAxis).toEqual(expect.objectContaining({ type: "category", data: ["R0", "R1", "R2", "R3"] }));
    expect(option.xAxis).toEqual(expect.objectContaining({ type: "value", name: "人数" }));
    expect(option.series[0].data).toEqual([
      expect.objectContaining({ value: 10, itemStyle: { color: "#2f9e44" } }),
      expect.objectContaining({ value: 0, itemStyle: { color: "#0f766e" } }),
      expect.objectContaining({ value: 4, itemStyle: { color: "#d97706" } }),
      expect.objectContaining({ value: 0, itemStyle: { color: "#d9363e" } })
    ]);
  });

  it("renders prescription trends as generated, published and optional rejected series", async () => {
    setOptionMock.mockClear();
    render(<PrescriptionTrendChart data={[{ date: "2026-06-01", generated: 8, approved: 5, rejected: 1 } as any]} />);

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    const option = setOptionMock.mock.calls.at(-1)?.[0] as any;

    expect(option.series.map((series: any) => series.name)).toEqual(["生成数", "发布数", "驳回数"]);
    expect(option.series[0]).toEqual(expect.objectContaining({ type: "line", smooth: true }));
    expect(option.series[0].areaStyle).toEqual(expect.objectContaining({ opacity: expect.any(Number) }));
  });

  it("renders expert queue as R2/R3 stacked status columns", async () => {
    setOptionMock.mockClear();
    render(<ExpertQueueChart data={[{ status: "待审核", r2: 7, r3: 2 } as any, { status: "已超时", r2: 3, r3: 1 } as any]} />);

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    const option = setOptionMock.mock.calls.at(-1)?.[0] as any;

    expect(option.xAxis).toEqual(expect.objectContaining({ type: "category", data: ["待审核", "已超时"] }));
    expect(option.series.map((series: any) => series.name)).toEqual(["R2", "R3"]);
    expect(option.series.every((series: any) => series.stack === "risk-level")).toBe(true);
  });

  it("limits rule hit rank to top 10 and keeps full labels in tooltip metadata", async () => {
    setOptionMock.mockClear();
    render(
      <RuleHitRankChart
        data={Array.from({ length: 12 }, (_, index) => ({ rule: `规则-${index + 1}-非常长的命中规则名称`, count: index + 1 }))}
      />
    );

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    const option = setOptionMock.mock.calls.at(-1)?.[0] as any;

    expect(option.yAxis.data).toHaveLength(10);
    expect(option.series[0].data[0]).toEqual(expect.objectContaining({ value: 12, fullLabel: "规则-12-非常长的命中规则名称" }));
  });

  it("renders template usage with a restrained blue to teal gradient", async () => {
    setOptionMock.mockClear();
    render(<TemplateUsageChart data={[{ template: "控压模板", count: 18 }]} />);

    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    const option = setOptionMock.mock.calls.at(-1)?.[0] as any;

    expect(option.series[0].itemStyle.color).toEqual(
      expect.objectContaining({ type: "linear", colorStops: expect.arrayContaining([expect.objectContaining({ color: "#1677ff" }), expect.objectContaining({ color: "#0f766e" })]) })
    );
  });

  it("keeps chart animation on by default and disables it for reduced motion", async () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    Object.defineProperty(window, "matchMedia", { writable: true, value: matchMediaMock });

    const { unmount } = render(<PrescriptionTrendChart data={[{ date: "2026-06-01", generated: 4, approved: 2 }]} />);
    await waitFor(() => expect(setOptionMock).toHaveBeenCalled());
    expect(setOptionMock).toHaveBeenLastCalledWith(expect.objectContaining({ animation: false }), true);
    unmount();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });

    render(<PrescriptionTrendChart data={[{ date: "2026-06-02", generated: 6, approved: 5 }]} />);
    await waitFor(() => expect(setOptionMock).toHaveBeenLastCalledWith(expect.objectContaining({ animation: true }), true));
  });
});
