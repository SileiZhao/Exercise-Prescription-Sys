import type { EChartsOption } from "echarts";

import { BaseEChart, type ChartStateProps, hasChartData } from "./BaseEChart";

const palette = ["#1677ff", "#0f766e", "#d97706", "#d9363e", "#3b82f6", "#14b8a6", "#64748b"];
const riskOrder = ["R0", "R1", "R2", "R3"] as const;
const riskColors: Record<(typeof riskOrder)[number], string> = {
  R0: "#2f9e44",
  R1: "#0f766e",
  R2: "#d97706",
  R3: "#d9363e"
};
const axisTextColor = "#667085";
const axisLineColor = "#d9e2ec";
const splitLineColor = "#edf2f7";

const baseTooltip = {
  trigger: "axis" as const,
  backgroundColor: "#ffffff",
  borderColor: "#e5eaf2",
  borderWidth: 1,
  padding: [10, 12],
  textStyle: { color: "#172033", fontSize: 12 },
  extraCssText: "box-shadow:0 8px 24px rgba(24,44,74,.08);border-radius:8px;"
};

const valueAxis = (name?: string) => ({
  type: "value" as const,
  name,
  nameTextStyle: { color: axisTextColor, padding: [0, 0, 0, 4] },
  axisLabel: { color: axisTextColor, fontSize: 12 },
  axisLine: { lineStyle: { color: axisLineColor } },
  splitLine: { lineStyle: { color: splitLineColor } }
});

const categoryAxis = (data: string[], rotate = 0) => ({
  type: "category" as const,
  data,
  axisLabel: { color: axisTextColor, fontSize: 12, interval: 0, rotate },
  axisLine: { lineStyle: { color: axisLineColor } },
  axisTick: { alignWithLabel: true }
});

type NamedValue = {
  name: string;
  value: number;
};

export type RiskDistributionDatum = NamedValue;
export type RuleHitRankDatum = {
  rule: string;
  count: number;
};
export type TemplateUsageDatum = {
  template: string;
  count: number;
};
export type ExpertQueueDatum = {
  status: string;
  count?: number;
  r2?: number;
  r3?: number;
  riskLevel?: "R2" | "R3" | string;
};
export type PrescriptionTrendDatum = {
  date: string;
  generated: number;
  approved?: number;
  published?: number;
  rejected?: number;
};
export type AdherenceDatum = {
  label: string;
  completionRate: number;
  targetRate?: number;
};
export type CompletionTrendDatum = {
  label: string;
  completionRate: number;
  targetRate?: number;
};
export type HealthRadarDatum = {
  metric: string;
  value: number;
  max?: number;
};
export type FeedbackTrendDatum = {
  date: string;
  rpe?: number;
  pain?: number;
  completionRate?: number;
};
export type ClusterScatterDatum = {
  x: number;
  y: number;
  cluster: string;
  label?: string;
};
export type StageEvaluationCompareDatum = {
  metric: string;
  current: number;
  previous?: number;
};
export type BloodPressureTrendDatum = {
  date: string;
  sbp?: number;
  dbp?: number;
};
export type BloodGlucoseTrendDatum = {
  date: string;
  value?: number;
};

function chartBase(testId: string, title: string, option: EChartsOption, props: ChartStateProps<unknown>) {
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return (
    <BaseEChart
      ariaLabel={title}
      testId={testId}
      option={{
        backgroundColor: "transparent",
        color: palette,
        textStyle: {
          color: "#172033",
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        },
        tooltip: baseTooltip,
        animation: !reducedMotion,
        animationDuration: reducedMotion ? 0 : 160,
        animationEasing: "cubicOut",
        ...option
      }}
      loading={props.loading}
      empty={!hasChartData(props.data)}
      error={props.error}
      height={props.height}
    />
  );
}

function compactLabel(label: string, maxLength = 14) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

function barOption(labels: string[], values: number[], horizontal = false): EChartsOption {
  return {
    grid: { left: horizontal ? 112 : 44, right: 32, top: 24, bottom: 44, containLabel: true },
    xAxis: horizontal ? valueAxis("数量") : categoryAxis(labels),
    yAxis: horizontal ? categoryAxis(labels) : valueAxis("数量"),
    series: [
      {
        name: "数量",
        type: "bar",
        data: values,
        barMaxWidth: 24,
        itemStyle: { color: "#1677ff", borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        label: { show: true, position: horizontal ? "right" : "top", color: axisTextColor, formatter: "{c}" }
      }
    ]
  };
}

export function RiskDistributionChart(props: ChartStateProps<RiskDistributionDatum>) {
  const values = new Map((props.data ?? []).map((item) => [item.name, Number(item.value) || 0]));
  const option: EChartsOption = {
    grid: { left: 52, right: 56, top: 18, bottom: 32, containLabel: true },
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const item = Array.isArray(params) ? params[0] : params;
        const datum = (item as { name?: string; value?: number }) ?? {};
        return `${datum.name ?? "风险"}：${datum.value ?? 0} 人`;
      }
    },
    xAxis: valueAxis("人数"),
    yAxis: categoryAxis([...riskOrder]),
    series: [
      {
        name: "人数",
        type: "bar",
        data: riskOrder.map((level) => ({ value: values.get(level) ?? 0, itemStyle: { color: riskColors[level] } })),
        barMaxWidth: 22,
        label: { show: true, position: "right", color: axisTextColor, formatter: "{c} 人" }
      }
    ]
  };
  return chartBase("RiskDistributionChart-echart", "风险分布图", option, props);
}
RiskDistributionChart.displayName = "RiskDistributionChart";

export function PrescriptionTrendChart(props: ChartStateProps<PrescriptionTrendDatum>) {
  const data = props.data ?? [];
  const hasRejected = data.some((item) => typeof item.rejected === "number");
  const series: EChartsOption["series"] = [
    {
      name: "生成数",
      type: "line",
      smooth: true,
      symbolSize: 6,
      lineStyle: { color: "#1677ff", width: 2 },
      itemStyle: { color: "#1677ff" },
      areaStyle: { color: "rgba(22,119,255,.12)", opacity: 0.18 },
      data: data.map((item) => item.generated)
    },
    {
      name: "发布数",
      type: "line",
      smooth: true,
      symbolSize: 6,
      lineStyle: { color: "#0f766e", width: 2 },
      itemStyle: { color: "#0f766e" },
      areaStyle: { color: "rgba(15,118,110,.10)", opacity: 0.14 },
      data: data.map((item) => item.published ?? item.approved ?? 0)
    }
  ];
  if (hasRejected) {
    series.push({
      name: "驳回数",
      type: "line",
      smooth: true,
      symbolSize: 6,
      lineStyle: { color: "#d9363e", width: 2 },
      itemStyle: { color: "#d9363e" },
      areaStyle: { color: "rgba(217,54,62,.08)", opacity: 0.12 },
      data: data.map((item) => item.rejected ?? 0)
    });
  }
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 28, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.date)),
    yAxis: valueAxis("份"),
    series
  };
  return chartBase("PrescriptionTrendChart-echart", "处方趋势图", option, props);
}
PrescriptionTrendChart.displayName = "PrescriptionTrendChart";

export function AdherenceChart(props: ChartStateProps<AdherenceDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 30, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.label)),
    yAxis: { ...valueAxis("%"), max: 100 },
    series: [
      { name: "完成率", type: "bar", data: data.map((item) => item.completionRate), barMaxWidth: 24, itemStyle: { color: "#0f766e", borderRadius: [4, 4, 0, 0] } },
      { name: "目标线", type: "line", data: data.map((item) => item.targetRate ?? 80), symbolSize: 6, lineStyle: { color: "#1677ff", width: 2 } }
    ]
  };
  return chartBase("AdherenceChart-echart", "依从性图", option, props);
}
AdherenceChart.displayName = "AdherenceChart";

export function CompletionTrendChart(props: ChartStateProps<CompletionTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 36, top: 48, bottom: 40, containLabel: true },
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params];
        return items
          .map((item) => {
            const point = item as { seriesName?: string; name?: string; value?: number };
            return `${point.seriesName ?? "完成率"}：${point.value ?? 0}%`;
          })
          .join("<br/>");
      }
    },
    xAxis: categoryAxis(data.map((item) => item.label)),
    yAxis: { ...valueAxis("完成率%"), max: 100 },
    series: [
      {
        name: "完成率",
        type: "line",
        smooth: true,
        symbolSize: 7,
        lineStyle: { color: "#0f766e", width: 2 },
        itemStyle: { color: "#0f766e" },
        areaStyle: { color: "rgba(15,118,110,.12)", opacity: 0.16 },
        data: data.map((item) => item.completionRate)
      },
      {
        name: "目标线",
        type: "line",
        symbol: "none",
        lineStyle: { color: "#1677ff", width: 2, type: "dashed" },
        data: data.map((item) => item.targetRate ?? 80)
      }
    ]
  };
  return chartBase("CompletionTrendChart-echart", "用户完成率趋势图", option, props);
}
CompletionTrendChart.displayName = "CompletionTrendChart";

export function RuleHitRankChart(props: ChartStateProps<RuleHitRankDatum>) {
  const data = [...(props.data ?? [])].sort((left, right) => right.count - left.count).slice(0, 10);
  const option: EChartsOption = {
    grid: { left: 140, right: 52, top: 16, bottom: 32, containLabel: true },
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const item = Array.isArray(params) ? params[0] : params;
        const dataItem = (item as { data?: { fullLabel?: string; value?: number } }).data;
        return `${dataItem?.fullLabel ?? "规则"}：${dataItem?.value ?? 0} 次`;
      }
    },
    xAxis: valueAxis("命中次数"),
    yAxis: categoryAxis(data.map((item) => compactLabel(item.rule, 18))),
    series: [
      {
        name: "命中次数",
        type: "bar",
        data: data.map((item) => ({ value: item.count, fullLabel: item.rule })),
        barMaxWidth: 22,
        itemStyle: { color: "#1677ff", borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: axisTextColor }
      }
    ]
  };
  return chartBase("RuleHitRankChart-echart", "规则命中排行图", option, props);
}
RuleHitRankChart.displayName = "RuleHitRankChart";

export function HealthRadarChart(props: ChartStateProps<HealthRadarDatum>) {
  const data = props.data ?? [];
  const normalizedValues = data.map((item) => {
    const max = item.max && item.max > 0 ? item.max : 100;
    const percent = (item.value / max) * 100;
    return Math.round(Math.min(Math.max(percent, 0), 100) * 10) / 10;
  });
  const option: EChartsOption = {
    tooltip: { ...baseTooltip, trigger: "item" },
    radar: {
      indicator: data.map((item) => ({ name: item.metric, max: 100 })),
      radius: "64%",
      axisName: { color: axisTextColor, fontSize: 12 },
      splitLine: { lineStyle: { color: splitLineColor } },
      splitArea: { areaStyle: { color: ["rgba(22,119,255,.03)", "rgba(15,118,110,.04)"] } }
    },
    series: [
      {
        name: "健康画像",
        type: "radar",
        areaStyle: { opacity: 0.16, color: "rgba(22,119,255,.16)" },
        lineStyle: { color: "#1677ff", width: 2 },
        data: [{ name: "当前", value: normalizedValues }]
      }
    ]
  };
  return chartBase("HealthRadarChart-echart", "健康雷达图", option, props);
}
HealthRadarChart.displayName = "HealthRadarChart";

export function FeedbackTrendChart(props: ChartStateProps<FeedbackTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 44, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.date)),
    yAxis: [{ ...valueAxis("RPE/疼痛") }, { ...valueAxis("完成率%"), max: 100 }],
    series: [
      { name: "RPE", type: "line", smooth: true, data: data.map((item) => item.rpe ?? 0), lineStyle: { color: "#1677ff", width: 2 }, itemStyle: { color: "#1677ff" } },
      { name: "疼痛", type: "line", smooth: true, data: data.map((item) => item.pain ?? 0), lineStyle: { color: "#d9363e", width: 2 }, itemStyle: { color: "#d9363e" } },
      {
        name: "完成率",
        type: "bar",
        yAxisIndex: 1,
        data: data.map((item) => item.completionRate ?? 0),
        barMaxWidth: 22,
        itemStyle: { color: "#0f766e", borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
  return chartBase("FeedbackTrendChart-echart", "反馈趋势图", option, props);
}
FeedbackTrendChart.displayName = "FeedbackTrendChart";

export function ClusterScatterChart(props: ChartStateProps<ClusterScatterDatum>) {
  const data = props.data ?? [];
  const clusters = Array.from(new Set(data.map((item) => item.cluster)));
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 28, top: 48, bottom: 40, containLabel: true },
    xAxis: valueAxis("分型维度 X"),
    yAxis: valueAxis("分型维度 Y"),
    series: clusters.map((cluster, index) => ({
      name: cluster,
      type: "scatter",
      symbolSize: 12,
      itemStyle: { color: palette[index % palette.length], opacity: 0.86 },
      data: data
        .filter((item) => item.cluster === cluster)
        .map((item) => ({ value: [item.x, item.y], name: item.label ?? cluster }))
    }))
  };
  return chartBase("ClusterScatterChart-echart", "聚类散点图", option, props);
}
ClusterScatterChart.displayName = "ClusterScatterChart";

export function StageEvaluationCompareChart(props: ChartStateProps<StageEvaluationCompareDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 52, right: 28, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.metric)),
    yAxis: valueAxis("指标值"),
    series: [
      { name: "上一阶段", type: "bar", data: data.map((item) => item.previous ?? 0), barMaxWidth: 22, itemStyle: { color: "#94a3b8", borderRadius: [4, 4, 0, 0] } },
      { name: "当前阶段", type: "bar", data: data.map((item) => item.current), barMaxWidth: 22, itemStyle: { color: "#1677ff", borderRadius: [4, 4, 0, 0] } }
    ]
  };
  return chartBase("StageEvaluationCompareChart-echart", "阶段评估对比图", option, props);
}
StageEvaluationCompareChart.displayName = "StageEvaluationCompareChart";

export function TemplateUsageChart(props: ChartStateProps<TemplateUsageDatum>) {
  const data = [...(props.data ?? [])].sort((left, right) => right.count - left.count).slice(0, 10);
  const option: EChartsOption = {
    ...barOption(data.map((item) => compactLabel(item.template, 16)), data.map((item) => item.count), true),
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const item = Array.isArray(params) ? params[0] : params;
        const index = Number((item as { dataIndex?: number }).dataIndex ?? 0);
        return `${data[index]?.template ?? "模板"}：${data[index]?.count ?? 0} 次`;
      }
    },
    series: [
      {
        name: "使用量",
        type: "bar",
        data: data.map((item) => item.count),
        barMaxWidth: 22,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: "#1677ff" },
              { offset: 1, color: "#0f766e" }
            ]
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: { show: true, position: "right", color: axisTextColor }
      }
    ]
  };
  return chartBase("TemplateUsageChart-echart", "模板使用图", option, props);
}
TemplateUsageChart.displayName = "TemplateUsageChart";

function normalizeExpertQueue(data: ExpertQueueDatum[]) {
  const rows = new Map<string, { status: string; r2: number; r3: number }>();
  data.forEach((item) => {
    const match = item.status.match(/^(R[23])\s+(.+)$/);
    const riskLevel = item.riskLevel ?? match?.[1];
    const status = match?.[2] ?? item.status;
    const row = rows.get(status) ?? { status, r2: 0, r3: 0 };
    if (typeof item.r2 === "number" || typeof item.r3 === "number") {
      row.r2 += item.r2 ?? 0;
      row.r3 += item.r3 ?? 0;
    } else if (riskLevel === "R3") {
      row.r3 += item.count ?? 0;
    } else {
      row.r2 += item.count ?? 0;
    }
    rows.set(status, row);
  });
  return Array.from(rows.values());
}

export function ExpertQueueChart(props: ChartStateProps<ExpertQueueDatum>) {
  const data = normalizeExpertQueue(props.data ?? []);
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 28, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.status)),
    yAxis: valueAxis("任务数"),
    series: [
      {
        name: "R2",
        type: "bar",
        stack: "risk-level",
        data: data.map((item) => item.r2),
        barMaxWidth: 28,
        itemStyle: { color: riskColors.R2, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: "R3",
        type: "bar",
        stack: "risk-level",
        data: data.map((item) => item.r3),
        barMaxWidth: 28,
        itemStyle: { color: riskColors.R3, borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
  return chartBase("ExpertQueueChart-echart", "专家队列图", option, props);
}
ExpertQueueChart.displayName = "ExpertQueueChart";

export function BloodPressureTrendChart(props: ChartStateProps<BloodPressureTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0, textStyle: { color: axisTextColor } },
    grid: { left: 44, right: 28, top: 48, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.date)),
    yAxis: valueAxis("mmHg"),
    series: [
      { name: "收缩压", type: "line", smooth: true, data: data.map((item) => item.sbp ?? null), lineStyle: { color: "#1677ff", width: 2 } },
      { name: "舒张压", type: "line", smooth: true, data: data.map((item) => item.dbp ?? null), lineStyle: { color: "#0f766e", width: 2 } }
    ]
  };
  return chartBase("BloodPressureTrendChart-echart", "血压趋势图", option, props);
}
BloodPressureTrendChart.displayName = "BloodPressureTrendChart";

export function BloodGlucoseTrendChart(props: ChartStateProps<BloodGlucoseTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    grid: { left: 44, right: 28, top: 32, bottom: 40, containLabel: true },
    xAxis: categoryAxis(data.map((item) => item.date)),
    yAxis: valueAxis("mmol/L"),
    series: [
      {
        name: "血糖",
        type: "line",
        smooth: true,
        lineStyle: { color: "#1677ff", width: 2 },
        areaStyle: { color: "rgba(22,119,255,.12)", opacity: 0.12 },
        data: data.map((item) => item.value ?? null)
      }
    ]
  };
  return chartBase("BloodGlucoseTrendChart-echart", "血糖趋势图", option, props);
}
BloodGlucoseTrendChart.displayName = "BloodGlucoseTrendChart";
