import { formatStatusLabel } from "../../../components/ProductUI";
import type { ReviewDetail, ReviewQueueFilters, ReviewQueueItem, ReviewStats } from "../../../api/expertReviews";

export type EditorState = {
  frequency: string;
  intensity: string;
  time: string;
  type: string;
  volume: string;
  progression: string;
  precautions: string;
  contraindications: string;
  reassessment: string;
  safety_notice: string;
};

export const emptyEditor: EditorState = {
  frequency: "",
  intensity: "",
  time: "",
  type: "",
  volume: "",
  progression: "",
  precautions: "",
  contraindications: "",
  reassessment: "",
  safety_notice: ""
};

export const fittLabels: Record<string, string> = {
  frequency: "频率",
  intensity: "强度",
  time: "时间",
  type: "类型",
  volume: "总量",
  progression: "进阶"
};

export const defaultReviewComments = {
  approve: "已核查风险规则、RAG 证据、模板来源和禁忌动作，同意发布。",
  reject: "资料或处方安全边界不足，退回修改。",
  refer: "当前风险需医学评估或线下转介。",
  requestInfo: "请补充近期血压、血糖或异常反馈相关资料。",
  pause: "异常反馈或资料不足期间暂停运动，待复核后恢复。"
};

export function splitList(value: string) {
  return value
    .split(/[，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function displayValue(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join("、") : fallback;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function displayChangeReason(value: unknown) {
  const raw = displayValue(value);
  const labels: Record<string, string> = {
    AI_DRAFT: "系统初稿",
    EXPERT_REQUEST_INFO: "专家要求补充资料",
    EXPERT_EDIT: "专家调整",
    SYSTEM_REGENERATED: "系统重生成"
  };
  return labels[raw] ?? raw.replace(/^AI[_-]?/i, "系统");
}

export function recordValue(record: Record<string, unknown> | null | undefined, key: string) {
  return displayValue(record?.[key]);
}

export function editorFromDetail(detail: ReviewDetail): EditorState {
  const fitt = detail.prescription.fitt_vp ?? {};
  return {
    frequency: String(fitt.frequency ?? ""),
    intensity: String(fitt.intensity ?? ""),
    time: String(fitt.time ?? ""),
    type: Array.isArray(fitt.type) ? fitt.type.map(String).join("，") : String(fitt.type ?? ""),
    volume: String(fitt.volume ?? ""),
    progression: String(fitt.progression ?? ""),
    precautions: (detail.prescription.precautions ?? []).join("，"),
    contraindications: (detail.prescription.contraindications ?? []).join("，"),
    reassessment: String(detail.prescription.reassessment ?? ""),
    safety_notice: String(detail.prescription.safety_notice ?? "")
  };
}

export function queueChartData(items: ReviewQueueItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.risk_level} ${formatStatusLabel(item.status, "review")}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

export function riskDistributionData(items: ReviewQueueItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.risk_level] = (acc[item.risk_level] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export function sixDataLines(detail: ReviewDetail | null) {
  const snapshot = detail?.health_snapshot ?? {};
  const profile = snapshot.profile;
  const fitness = snapshot.fitness_test;
  const body = snapshot.body_composition;
  const biochemical = snapshot.biochemical_index;
  const risk = snapshot.risk_screening;
  const feedback = snapshot.exercise_feedback;
  return [
    `基础：${recordValue(profile, "name")}，年龄 ${recordValue(profile, "age")}`,
    `体测：血压 ${recordValue(fitness, "sbp")}/${recordValue(fitness, "dbp")} mmHg，疼痛 ${recordValue(fitness, "pain_score")}，6MWT ${recordValue(fitness, "six_mwt")}m`,
    `体成分：体脂 ${recordValue(body, "body_fat_pct")}%，骨骼肌 ${recordValue(body, "skeletal_muscle_kg")}kg`,
    `生化：空腹血糖 ${recordValue(biochemical, "fbg")}，LDL-C ${recordValue(biochemical, "ldl_c")}`,
    `风险问卷：高血压 ${recordValue(risk, "has_hypertension")}，糖尿病 ${recordValue(risk, "has_diabetes")}，胸痛 ${recordValue(risk, "chest_pain")}`,
    `运动反馈：RPE ${recordValue(feedback, "rpe")}，完成率 ${recordValue(feedback, "completion_rate")}%`
  ];
}

export function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanRiskLabel(value: unknown) {
  if (value === true || value === "true" || value === "是") return "是";
  if (value === false || value === "false" || value === "否") return "否";
  return displayValue(value);
}

export function clinicalLabRows(detail: ReviewDetail | null) {
  const snapshot = detail?.health_snapshot ?? {};
  const fitness = snapshot.fitness_test;
  const body = snapshot.body_composition;
  const biochemical = snapshot.biochemical_index;
  const risk = snapshot.risk_screening;
  const feedback = snapshot.exercise_feedback;
  const sbp = asNumber(fitness?.sbp);
  const dbp = asNumber(fitness?.dbp);
  const pain = asNumber(fitness?.pain_score);
  const fbg = asNumber(biochemical?.fbg);
  const ldl = asNumber(biochemical?.ldl_c);
  const completion = asNumber(feedback?.completion_rate);
  return [
    {
      group: "生命体征",
      label: "血压",
      value: `${recordValue(fitness, "sbp")}/${recordValue(fitness, "dbp")}`,
      unit: "mmHg",
      tone: sbp !== null && dbp !== null && (sbp >= 180 || dbp >= 110) ? "danger" : sbp !== null && dbp !== null && (sbp >= 140 || dbp >= 90) ? "warning" : "normal",
      note: "R2/R3 关键阈值"
    },
    {
      group: "生命体征",
      label: "疼痛评分",
      value: recordValue(fitness, "pain_score"),
      unit: "/10",
      tone: pain !== null && pain >= 7 ? "danger" : pain !== null && pain >= 4 ? "warning" : "normal",
      note: "影响动作禁忌"
    },
    {
      group: "体成分",
      label: "体脂 / 骨骼肌",
      value: `${recordValue(body, "body_fat_pct")}% / ${recordValue(body, "skeletal_muscle_kg")}`,
      unit: "kg",
      tone: "normal",
      note: "模板匹配"
    },
    {
      group: "生化",
      label: "空腹血糖",
      value: recordValue(biochemical, "fbg"),
      unit: "mmol/L",
      tone: fbg !== null && fbg >= 7 ? "danger" : fbg !== null && fbg >= 6.1 ? "warning" : "normal",
      note: "代谢风险"
    },
    {
      group: "生化",
      label: "LDL-C",
      value: recordValue(biochemical, "ldl_c"),
      unit: "mmol/L",
      tone: ldl !== null && ldl >= 4.1 ? "warning" : "normal",
      note: "心血管风险"
    },
    {
      group: "红旗",
      label: "胸痛 / 晕厥 / 气短",
      value: `${booleanRiskLabel(risk?.chest_pain)} / ${booleanRiskLabel(risk?.syncope)} / ${booleanRiskLabel(risk?.abnormal_dyspnea)}`,
      unit: "",
      tone: risk?.chest_pain || risk?.syncope || risk?.abnormal_dyspnea ? "danger" : "normal",
      note: "R3 拦截"
    },
    {
      group: "反馈",
      label: "完成率 / RPE",
      value: `${recordValue(feedback, "completion_rate")}% / ${recordValue(feedback, "rpe")}`,
      unit: "",
      tone: completion !== null && completion < 60 ? "warning" : "normal",
      note: "动态调整"
    }
  ];
}

export function trendLine(detail: ReviewDetail | null) {
  const trends = detail?.trends ?? {};
  const bloodPressure = Array.isArray(trends.blood_pressure)
    ? trends.blood_pressure.map((item) => String(item)).join(" → ")
    : "-";
  const completion = Array.isArray(trends.feedback_completion)
    ? trends.feedback_completion.map((item) => `${String(item)}%`).join(" → ")
    : "-";
  return `趋势：血压 ${bloodPressure}；完成率 ${completion}`;
}

export function versionLines(detail: ReviewDetail | null, selected: ReviewQueueItem | null) {
  const versions = detail?.versions ?? [];
  if (versions.length) {
    return versions.map((version) =>
      `v${displayValue(version.version)} ${formatStatusLabel(String(version.status ?? "unknown"), "review")} ${displayChangeReason(version.change_reason)}`
    );
  }
  return selected ? [`v${selected.version} ${formatStatusLabel(selected.status, "review")}`] : [];
}

export function fittLines(fitt: Record<string, unknown> | null | undefined) {
  return Object.entries(fittLabels).map(([key, label]) => `${label}：${displayValue(fitt?.[key])}`);
}

export function structuredDiffLines(detail: ReviewDetail | null) {
  const current = detail?.prescription.fitt_vp ?? {};
  const aiDraft = (detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? {};
  const lines = Object.entries(fittLabels)
    .filter(([key]) => displayValue(aiDraft[key]) !== displayValue(current[key]))
    .map(([key, label]) => `${label}：系统建议 ${displayValue(aiDraft[key])} → 当前 ${displayValue(current[key])}`);
  return lines.length ? lines : ["系统初稿与当前处方结构一致"];
}

export function priorityMeta(item: ReviewQueueItem) {
  if (item.risk_level === "R3") {
    return { label: "最高", color: "red", tone: "danger" };
  }
  if (item.abnormal_feedback_count > 0 || item.status === "PENDING_REVIEW") {
    return { label: "高", color: "orange", tone: "warning" };
  }
  return { label: "中", color: "blue", tone: "info" };
}

export function priorityReason(item: ReviewQueueItem) {
  if (item.risk_level === "R3") {
    return "R3 只处理医学评估/转介，不能发布训练处方。";
  }
  if (item.abnormal_feedback_count > 0) {
    return `存在 ${item.abnormal_feedback_count} 次异常反馈，先排除停止信号。`;
  }
  if (item.status === "PENDING_REVIEW") {
    return "待领取任务，领取后进入详情核对。";
  }
  if (item.status === "IN_REVIEW") {
    return "已在审核中，继续完成证据核对。";
  }
  return "按处方版本和审核状态复核。";
}

export function queueActionLabel(item: ReviewQueueItem) {
  if (item.status === "PENDING_REVIEW") {
    return item.risk_level === "R3" ? "领取并处理转介" : "领取并预览";
  }
  return item.risk_level === "R3" ? "打开转介处理" : "打开详情";
}

export function prescriptionTypeLabel(value: string) {
  const labels: Record<string, string> = {
    training: "训练处方",
    referral: "医学评估",
    follow_up: "复评处方"
  };
  return labels[value] ?? value;
}

export function priorityScore(item: ReviewQueueItem) {
  return (
    (item.risk_level === "R3" ? 100 : 0) +
    (item.abnormal_feedback_count > 0 ? 80 : 0) +
    (item.status === "PENDING_REVIEW" ? 40 : 0) +
    (item.status === "IN_REVIEW" ? 20 : 0)
  );
}

export function expertWorkBuckets(items: ReviewQueueItem[], stats: ReviewStats | null) {
  const r3Items = items.filter((item) => item.risk_level === "R3");
  const abnormalItems = items.filter((item) => item.abnormal_feedback_count > 0);
  const pendingItems = items.filter((item) => item.status === "PENDING_REVIEW");
  return [
    {
      title: "R3 转介",
      count: r3Items.length,
      detail: "不发布训练处方，优先给医学评估意见",
      tone: "danger" as const,
      items: r3Items
    },
    {
      title: "异常反馈",
      count: abnormalItems.length,
      detail: "疼痛、RPE、胸闷等停止信号",
      tone: "warning" as const,
      items: abnormalItems
    },
    {
      title: "超时任务",
      count: stats?.timeout_count ?? 0,
      detail: "超过审核 SLA，需先领取或关闭",
      tone: (stats?.timeout_count ?? 0) ? "warning" as const : "neutral" as const,
      items: items.filter((item) => item.status === "IN_REVIEW")
    },
    {
      title: "待领取",
      count: pendingItems.length,
      detail: "开始审核后才能查看完整详情",
      tone: pendingItems.length ? "info" as const : "neutral" as const,
      items: pendingItems
    }
  ];
}

export function isForbiddenError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: unknown } }).response === "object" &&
    (error as { response?: { status?: unknown } }).response?.status === 403
  );
}

export function requiresStartBeforeDetail(item: ReviewQueueItem) {
  return item.status === "PENDING_REVIEW";
}

export function activeFilterCount(filters: ReviewQueueFilters) {
  return Object.values(filters).filter((value) => value !== undefined && value !== "" && value !== false).length;
}
