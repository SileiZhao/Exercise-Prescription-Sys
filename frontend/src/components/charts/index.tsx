import type { EChartsOption } from "echarts";

import { BaseEChart, type ChartDataRow, type ChartStateProps, hasChartData } from "./BaseEChart";

const palette = ["#1677ff", "#52c41a", "#faad14", "#f5222d", "#722ed1", "#13c2c2", "#eb2f96"];

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
  count: number;
};
export type PrescriptionTrendDatum = {
  date: string;
  generated: number;
  approved?: number;
};
export type AdherenceDatum = {
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

function chartBase(
  testId: string,
  title: string,
  option: EChartsOption,
  props: ChartStateProps<unknown>,
  dataRows: ChartDataRow[] = [],
  dataSummary?: string
) {
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return (
    <BaseEChart
      ariaLabel={title}
      testId={testId}
      option={{
        color: palette,
        tooltip: { trigger: "axis" },
        animation: !reducedMotion,
        animationDuration: reducedMotion ? 0 : 450,
        ...option
      }}
      loading={props.loading}
      empty={!hasChartData(props.data)}
      error={props.error}
      height={props.height}
      dataRows={dataRows}
      dataSummary={dataSummary}
    />
  );
}

function pieOption(data: NamedValue[]): EChartsOption {
  return {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [
      {
        name: "分布",
        type: "pie",
        radius: ["42%", "70%"],
        avoidLabelOverlap: true,
        data
      }
    ]
  };
}

function barOption(labels: string[], values: number[], horizontal = false): EChartsOption {
  return {
    grid: { left: horizontal ? 96 : 40, right: 24, top: 24, bottom: 44 },
    xAxis: horizontal ? { type: "value" } : { type: "category", data: labels },
    yAxis: horizontal ? { type: "category", data: labels } : { type: "value" },
    series: [
      {
        name: "数量",
        type: "bar",
        data: values,
        barMaxWidth: 28
      }
    ]
  };
}

export function RiskDistributionChart(props: ChartStateProps<RiskDistributionDatum>) {
  const data = props.data ?? [];
  return chartBase(
    "RiskDistributionChart-echart",
    "风险分布图",
    pieOption(data),
    props,
    data.map((item) => ({ label: item.name, values: [{ label: "数量", value: item.value }] })),
    data.length ? `共 ${data.reduce((sum, item) => sum + item.value, 0)} 条风险样本` : undefined
  );
}
RiskDistributionChart.displayName = "RiskDistributionChart";

export function PrescriptionTrendChart(props: ChartStateProps<PrescriptionTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 40, right: 24, top: 48, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: { type: "value" },
    series: [
      { name: "生成处方", type: "line", smooth: true, data: data.map((item) => item.generated) },
      { name: "审核通过", type: "line", smooth: true, data: data.map((item) => item.approved ?? 0) }
    ]
  };
  return chartBase(
    "PrescriptionTrendChart-echart",
    "处方趋势图",
    option,
    props,
    data.map((item) => ({
      label: item.date,
      values: [
        { label: "生成处方", value: item.generated },
        { label: "审核通过", value: item.approved ?? 0 }
      ]
    })),
    data.length ? `最近 ${data.length} 个时间点的生成和发布趋势` : undefined
  );
}
PrescriptionTrendChart.displayName = "PrescriptionTrendChart";

export function AdherenceChart(props: ChartStateProps<AdherenceDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 44, right: 24, top: 48, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.label) },
    yAxis: { type: "value", max: 100 },
    series: [
      { name: "完成率", type: "bar", data: data.map((item) => item.completionRate), barMaxWidth: 26 },
      { name: "目标线", type: "line", data: data.map((item) => item.targetRate ?? 80) }
    ]
  };
  return chartBase(
    "AdherenceChart-echart",
    "依从性图",
    option,
    props,
    data.map((item) => ({
      label: item.label,
      values: [
        { label: "完成率", value: `${item.completionRate}%` },
        { label: "目标线", value: `${item.targetRate ?? 80}%` }
      ]
    })),
    data.length ? `共 ${data.length} 次完成率记录` : undefined
  );
}
AdherenceChart.displayName = "AdherenceChart";

export function RuleHitRankChart(props: ChartStateProps<RuleHitRankDatum>) {
  const data = [...(props.data ?? [])].sort((left, right) => right.count - left.count);
  return chartBase(
    "RuleHitRankChart-echart",
    "规则命中排行图",
    barOption(data.map((item) => item.rule), data.map((item) => item.count), true),
    props,
    data.map((item) => ({ label: item.rule, values: [{ label: "命中次数", value: item.count }] })),
    data.length ? `最高命中 ${data[0]?.rule ?? "-"} ${data[0]?.count ?? 0} 次` : undefined
  );
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
    tooltip: { trigger: "item" },
    radar: {
      indicator: data.map((item) => ({ name: item.metric, max: 100 })),
      radius: "65%"
    },
    series: [
      {
        name: "健康画像",
        type: "radar",
        areaStyle: { opacity: 0.16 },
        data: [{ name: "当前", value: normalizedValues }]
      }
    ]
  };
  return chartBase(
    "HealthRadarChart-echart",
    "健康雷达图",
    option,
    props,
    data.map((item, index) => ({
      label: item.metric,
      values: [
        { label: "原始值", value: item.value },
        { label: "标准化", value: normalizedValues[index] }
      ]
    })),
    data.length ? `共 ${data.length} 个健康画像指标` : undefined
  );
}
HealthRadarChart.displayName = "HealthRadarChart";

export function FeedbackTrendChart(props: ChartStateProps<FeedbackTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 42, right: 28, top: 48, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: [{ type: "value" }, { type: "value", max: 100 }],
    series: [
      { name: "RPE", type: "line", smooth: true, data: data.map((item) => item.rpe ?? 0) },
      { name: "疼痛", type: "line", smooth: true, data: data.map((item) => item.pain ?? 0) },
      {
        name: "完成率",
        type: "bar",
        yAxisIndex: 1,
        data: data.map((item) => item.completionRate ?? 0),
        barMaxWidth: 24
      }
    ]
  };
  return chartBase(
    "FeedbackTrendChart-echart",
    "反馈趋势图",
    option,
    props,
    data.map((item) => ({
      label: item.date,
      values: [
        { label: "RPE", value: item.rpe ?? "-" },
        { label: "疼痛", value: item.pain ?? "-" },
        { label: "完成率", value: item.completionRate !== undefined ? `${item.completionRate}%` : "-" }
      ]
    })),
    data.length ? `共 ${data.length} 条反馈趋势记录` : undefined
  );
}
FeedbackTrendChart.displayName = "FeedbackTrendChart";

export function ClusterScatterChart(props: ChartStateProps<ClusterScatterDatum>) {
  const data = props.data ?? [];
  const clusters = Array.from(new Set(data.map((item) => item.cluster)));
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 44, right: 24, top: 48, bottom: 40 },
    xAxis: { type: "value", name: "X" },
    yAxis: { type: "value", name: "Y" },
    series: clusters.map((cluster) => ({
      name: cluster,
      type: "scatter",
      symbolSize: 12,
      data: data
        .filter((item) => item.cluster === cluster)
        .map((item) => ({ value: [item.x, item.y], name: item.label ?? cluster }))
    }))
  };
  return chartBase(
    "ClusterScatterChart-echart",
    "聚类散点图",
    option,
    props,
    data.map((item) => ({
      label: item.label ?? item.cluster,
      values: [
        { label: "分型", value: item.cluster },
        { label: "X", value: item.x },
        { label: "Y", value: item.y }
      ]
    })),
    data.length ? `共 ${data.length} 个脱敏分型点` : undefined
  );
}
ClusterScatterChart.displayName = "ClusterScatterChart";

export function StageEvaluationCompareChart(props: ChartStateProps<StageEvaluationCompareDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 52, right: 24, top: 48, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.metric) },
    yAxis: { type: "value" },
    series: [
      { name: "上一阶段", type: "bar", data: data.map((item) => item.previous ?? 0), barMaxWidth: 24 },
      { name: "当前阶段", type: "bar", data: data.map((item) => item.current), barMaxWidth: 24 }
    ]
  };
  return chartBase(
    "StageEvaluationCompareChart-echart",
    "阶段评估对比图",
    option,
    props,
    data.map((item) => ({
      label: item.metric,
      values: [
        { label: "上一阶段", value: item.previous ?? "-" },
        { label: "当前阶段", value: item.current }
      ]
    })),
    data.length ? `共 ${data.length} 个阶段对比指标` : undefined
  );
}
StageEvaluationCompareChart.displayName = "StageEvaluationCompareChart";

export function TemplateUsageChart(props: ChartStateProps<TemplateUsageDatum>) {
  const data = [...(props.data ?? [])].sort((left, right) => right.count - left.count);
  return chartBase(
    "TemplateUsageChart-echart",
    "模板使用图",
    barOption(data.map((item) => item.template), data.map((item) => item.count), true),
    props,
    data.map((item) => ({ label: item.template, values: [{ label: "使用次数", value: item.count }] })),
    data.length ? `最高使用 ${data[0]?.template ?? "-"} ${data[0]?.count ?? 0} 次` : undefined
  );
}
TemplateUsageChart.displayName = "TemplateUsageChart";

export function ExpertQueueChart(props: ChartStateProps<ExpertQueueDatum>) {
  const data = props.data ?? [];
  return chartBase(
    "ExpertQueueChart-echart",
    "专家队列图",
    barOption(data.map((item) => item.status), data.map((item) => item.count)),
    props,
    data.map((item) => ({ label: item.status, values: [{ label: "任务数", value: item.count }] })),
    data.length ? `共 ${data.reduce((sum, item) => sum + item.count, 0)} 个审核任务` : undefined
  );
}
ExpertQueueChart.displayName = "ExpertQueueChart";

export function BloodPressureTrendChart(props: ChartStateProps<BloodPressureTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 44, right: 24, top: 48, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: { type: "value", name: "mmHg" },
    series: [
      { name: "收缩压", type: "line", smooth: true, data: data.map((item) => item.sbp ?? null) },
      { name: "舒张压", type: "line", smooth: true, data: data.map((item) => item.dbp ?? null) }
    ]
  };
  return chartBase(
    "BloodPressureTrendChart-echart",
    "血压趋势图",
    option,
    props,
    data.map((item) => ({
      label: item.date,
      values: [
        { label: "收缩压", value: item.sbp ?? "-" },
        { label: "舒张压", value: item.dbp ?? "-" }
      ]
    })),
    data.length ? `共 ${data.length} 条血压趋势记录` : undefined
  );
}
BloodPressureTrendChart.displayName = "BloodPressureTrendChart";

export function BloodGlucoseTrendChart(props: ChartStateProps<BloodGlucoseTrendDatum>) {
  const data = props.data ?? [];
  const option: EChartsOption = {
    grid: { left: 44, right: 24, top: 32, bottom: 40 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: { type: "value", name: "mmol/L" },
    series: [
      {
        name: "血糖",
        type: "line",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: data.map((item) => item.value ?? null)
      }
    ]
  };
  return chartBase(
    "BloodGlucoseTrendChart-echart",
    "血糖趋势图",
    option,
    props,
    data.map((item) => ({ label: item.date, values: [{ label: "血糖", value: item.value ?? "-" }] })),
    data.length ? `共 ${data.length} 条血糖趋势记录` : undefined
  );
}
BloodGlucoseTrendChart.displayName = "BloodGlucoseTrendChart";
