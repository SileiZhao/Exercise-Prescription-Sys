import type { ResearchExportRequest, ResearchSummary } from "../../../api/researchExport";

export function namedValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([name, value]) => ({ name, value }));
}

export function clusterScatterValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([cluster, count], index) => ({
    x: index + 1,
    y: count,
    cluster,
    label: `${cluster} ${count}`
  }));
}

export function effectCompare(summary: ResearchSummary | null) {
  const effects = summary?.intervention_effects;
  if (!effects) return [];
  return [
    { metric: "完成率", previous: 0, current: effects.average_completion_rate },
    { metric: "RPE", previous: 0, current: effects.average_rpe },
    { metric: "不适事件", previous: 0, current: effects.discomfort_event_count },
    { metric: "疼痛加重", previous: 0, current: effects.pain_worsened_count }
  ];
}

export function trendValues(items: Array<{ date: string; value?: number; rpe?: number; pain?: number; completionRate?: number }> = []) {
  return items;
}

export function namedDataRows(data: Record<string, number> = {}, valueLabel = "样本") {
  return Object.entries(data).map(([label, value]) => ({
    label,
    values: [{ label: valueLabel, value }]
  }));
}

export function effectDataRows(summary: ResearchSummary | null) {
  return effectCompare(summary).map((item) => ({
    label: item.metric,
    values: [
      { label: "干预前", value: item.previous },
      { label: "当前", value: item.current }
    ]
  }));
}

export function chartCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return String(value);
}

export function trendDataRows(items: Array<Record<string, unknown>>, valueLabels: Record<string, string>) {
  return items.map((item, index) => ({
    label: String(item.date ?? item.label ?? `第 ${index + 1} 条`),
    values: Object.entries(valueLabels).map(([key, label]) => ({
      label,
      value: chartCellValue(item[key])
    }))
  }));
}

export function currentUserId() {
  const raw = localStorage.getItem("current_user_id");
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function routeMode(pathname: string) {
  if (pathname.endsWith("/dashboard")) return "dashboard";
  if (pathname.endsWith("/cluster-analysis")) return "cluster";
  if (pathname.endsWith("/intervention-effects")) return "effects";
  if (pathname.endsWith("/export-jobs")) return "jobs";
  return "export";
}

export const researchRoutes = [
  {
    mode: "dashboard",
    title: "总览",
    href: "/research/dashboard",
    description: "样本、风险、完成率和 RPE"
  },
  {
    mode: "cluster",
    title: "分型",
    href: "/research/cluster-analysis",
    description: "聚类规模和风险叠加"
  },
  {
    mode: "effects",
    title: "干预",
    href: "/research/intervention-effects",
    description: "完成率、疼痛和生理趋势"
  },
  {
    mode: "jobs",
    title: "导出",
    href: "/research/export-jobs",
    description: "申请、审批和下载状态"
  }
];

export const exportFieldScope = [
  "研究匿名编号",
  "参与者编码",
  "年龄 / 性别 / BMI",
  "风险等级",
  "分型标签",
  "处方状态"
];

export const exportPurposeTemplates = [
  "阶段效果分析",
  "分型结构分析",
  "课题结题归档"
];

export function parseDateTime(value: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isExportExpired(request: ResearchExportRequest) {
  const expiresAt = parseDateTime(request.expires_at);
  return expiresAt !== null && expiresAt < Date.now();
}

export function isExportDownloaded(request: ResearchExportRequest) {
  return Boolean(request.downloaded_at);
}

export function canDownloadExport(request: ResearchExportRequest) {
  return request.status === "APPROVED" && !isExportExpired(request) && !isExportDownloaded(request);
}

export function exportAvailabilityText(request: ResearchExportRequest) {
  if (request.status !== "APPROVED") {
    return request.status === "PENDING" ? "待审批" : "已驳回";
  }
  if (isExportDownloaded(request)) {
    return "已下载";
  }
  if (isExportExpired(request)) {
    return "已过期";
  }
  return "限时可下载";
}

export function exportAvailabilityColor(request: ResearchExportRequest) {
  const text = exportAvailabilityText(request);
  if (text === "限时可下载") return "green";
  if (text === "已过期" || text === "已驳回") return "red";
  if (text === "已下载") return "blue";
  return "gold";
}

export function exportNextStep(request: ResearchExportRequest) {
  if (request.status === "PENDING") return "等待管理员审批，可在审批记录中查看进度";
  if (request.status === "REJECTED") return "按审批意见补充用途后重新申请";
  if (isExportDownloaded(request)) return "文件已下载，如需再次使用请重新申请";
  if (isExportExpired(request)) return "下载窗口已过期，请重新申请";
  return "可在有效期内下载一次";
}

export function researchReadiness(summary: ResearchSummary | null, total: number, hasError: boolean) {
  const sampleCount = summary?.total_participants ?? total;
  const feedbackCount = summary?.intervention_effects.feedback_count ?? 0;
  if (hasError) {
    return {
      tone: "danger" as const,
      title: "当前数据暂不可用于分析",
      description: "科研汇总加载失败，需要先恢复数据服务或确认科研权限。"
    };
  }
  if (!sampleCount) {
    return {
      tone: "warning" as const,
      title: "当前数据暂不可用于分析",
      description: "脱敏样本量为 0，暂不支持分型、干预效果或导出判断。"
    };
  }
  if (sampleCount < 10 || feedbackCount < 10) {
    return {
      tone: "warning" as const,
      title: "当前数据仅适合探索性观察",
      description: `脱敏样本 ${sampleCount} 例，反馈记录 ${feedbackCount} 条，适合查看结构，不适合输出稳定结论。`
    };
  }
  return {
    tone: "safe" as const,
    title: "当前数据可用于脱敏聚合分析",
    description: `脱敏样本 ${sampleCount} 例，反馈记录 ${feedbackCount} 条，可查看风险分布、分型结构和干预趋势。`
  };
}
