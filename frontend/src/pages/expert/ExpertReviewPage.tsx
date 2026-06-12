import { Alert, Button, Card, Checkbox, Col, Collapse, Drawer, Empty, Input, List, Modal, Pagination, Row, Select, Space, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  AppShell,
  ActionBar,
  AuditTrail,
  ClinicalStatusBadge,
  DataWorkbench,
  DecisionBanner,
  EvidenceTimeline,
  EvidenceCard,
  ForbiddenActionsPanel,
  formatStatusLabel,
  PrescriptionEditor,
  ReviewWorkbench,
  RuleHitCard,
  sanitizeDisplayText,
  statusTagColor,
  StatusTile,
  WorkbenchSection
} from "../../components/ProductUI";
import { ChartCard } from "../../components/ProductUI";
import { ExpertQueueChart, RiskDistributionChart } from "../../components/charts";
import {
  approvePrescription,
  getReviewDetail,
  getReviewStats,
  listReviewQueue,
  pausePrescription,
  referPrescription,
  requestMoreInformation,
  rejectPrescription,
  startReview as startReviewRequest,
  type ReviewDetail,
  type ReviewQueueFilters,
  type ReviewQueueItem,
  type ReviewStats
} from "../../api/expertReviews";

type EditorState = {
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

const emptyEditor: EditorState = {
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

const fittLabels: Record<string, string> = {
  frequency: "频率",
  intensity: "强度",
  time: "时间",
  type: "类型",
  volume: "总量",
  progression: "进阶"
};

const defaultReviewComments = {
  approve: "已核查风险规则、RAG 证据、模板来源和禁忌动作，同意发布。",
  reject: "资料或处方安全边界不足，退回修改。",
  refer: "当前风险需医学评估或线下转介。",
  requestInfo: "请补充近期血压、血糖或异常反馈相关资料。",
  pause: "异常反馈或资料不足期间暂停运动，待复核后恢复。"
};

function splitList(value: string) {
  return value
    .split(/[，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function displayValue(value: unknown, fallback = "-") {
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

function displayChangeReason(value: unknown) {
  const raw = displayValue(value);
  const labels: Record<string, string> = {
    AI_DRAFT: "系统初稿",
    EXPERT_REQUEST_INFO: "专家要求补充资料",
    EXPERT_EDIT: "专家调整",
    SYSTEM_REGENERATED: "系统重生成"
  };
  return labels[raw] ?? raw.replace(/^AI[_-]?/i, "系统");
}

function recordValue(record: Record<string, unknown> | null | undefined, key: string) {
  return displayValue(record?.[key]);
}

function editorFromDetail(detail: ReviewDetail): EditorState {
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

function queueChartData(items: ReviewQueueItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.risk_level} ${formatStatusLabel(item.status, "review")}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

function riskDistributionData(items: ReviewQueueItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.risk_level] = (acc[item.risk_level] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function sixDataLines(detail: ReviewDetail | null) {
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

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanRiskLabel(value: unknown) {
  if (value === true || value === "true" || value === "是") return "是";
  if (value === false || value === "false" || value === "否") return "否";
  return displayValue(value);
}

function clinicalLabRows(detail: ReviewDetail | null) {
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

function trendLine(detail: ReviewDetail | null) {
  const trends = detail?.trends ?? {};
  const bloodPressure = Array.isArray(trends.blood_pressure)
    ? trends.blood_pressure.map((item) => String(item)).join(" → ")
    : "-";
  const completion = Array.isArray(trends.feedback_completion)
    ? trends.feedback_completion.map((item) => `${String(item)}%`).join(" → ")
    : "-";
  return `趋势：血压 ${bloodPressure}；完成率 ${completion}`;
}

function versionLines(detail: ReviewDetail | null, selected: ReviewQueueItem | null) {
  const versions = detail?.versions ?? [];
  if (versions.length) {
    return versions.map((version) =>
      `v${displayValue(version.version)} ${formatStatusLabel(String(version.status ?? "unknown"), "review")} ${displayChangeReason(version.change_reason)}`
    );
  }
  return selected ? [`v${selected.version} ${formatStatusLabel(selected.status, "review")}`] : [];
}

function fittLines(fitt: Record<string, unknown> | null | undefined) {
  return Object.entries(fittLabels).map(([key, label]) => `${label}：${displayValue(fitt?.[key])}`);
}

function structuredDiffLines(detail: ReviewDetail | null) {
  const current = detail?.prescription.fitt_vp ?? {};
  const aiDraft = (detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? {};
  const lines = Object.entries(fittLabels)
    .filter(([key]) => displayValue(aiDraft[key]) !== displayValue(current[key]))
    .map(([key, label]) => `${label}：系统建议 ${displayValue(aiDraft[key])} → 当前 ${displayValue(current[key])}`);
  return lines.length ? lines : ["系统初稿与当前处方结构一致"];
}

function priorityMeta(item: ReviewQueueItem) {
  if (item.risk_level === "R3") {
    return { label: "最高", color: "red", tone: "danger" };
  }
  if (item.abnormal_feedback_count > 0 || item.status === "PENDING_REVIEW") {
    return { label: "高", color: "orange", tone: "warning" };
  }
  return { label: "中", color: "blue", tone: "info" };
}

function priorityReason(item: ReviewQueueItem) {
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

function queueActionLabel(item: ReviewQueueItem) {
  if (item.status === "PENDING_REVIEW") {
    return item.risk_level === "R3" ? "领取并处理转介" : "领取并预览";
  }
  return item.risk_level === "R3" ? "打开转介处理" : "打开详情";
}

function prescriptionTypeLabel(value: string) {
  const labels: Record<string, string> = {
    training: "训练处方",
    referral: "医学评估",
    follow_up: "复评处方"
  };
  return labels[value] ?? value;
}

function priorityScore(item: ReviewQueueItem) {
  return (
    (item.risk_level === "R3" ? 100 : 0) +
    (item.abnormal_feedback_count > 0 ? 80 : 0) +
    (item.status === "PENDING_REVIEW" ? 40 : 0) +
    (item.status === "IN_REVIEW" ? 20 : 0)
  );
}

function expertWorkBuckets(items: ReviewQueueItem[], stats: ReviewStats | null) {
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

function isForbiddenError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: unknown } }).response === "object" &&
    (error as { response?: { status?: unknown } }).response?.status === 403
  );
}

function requiresStartBeforeDetail(item: ReviewQueueItem) {
  return item.status === "PENDING_REVIEW";
}

function activeFilterCount(filters: ReviewQueueFilters) {
  return Object.values(filters).filter((value) => value !== undefined && value !== "" && value !== false).length;
}

function EditorField({
  id,
  label,
  wide = false,
  children
}: {
  id: string;
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`editor-field${wide ? " editor-field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function PatientSummaryPanel({
  detail,
  selected,
  detailError,
  detailErrorMessage
}: {
  detail: ReviewDetail | null;
  selected: ReviewQueueItem | null;
  detailError: boolean;
  detailErrorMessage: string;
}) {
  return (
    <Card title="用户安全摘要" className="expert-panel expert-patient-summary-card">
      {detail ? (
        <div className="expert-patient-summary">
          <div className="expert-patient-strip">
            <div>
              <span>用户</span>
              <strong>{`#${selected?.user_id}`}</strong>
            </div>
            <div>
              <span>姓名</span>
              <strong>{String(detail.health_snapshot.profile?.name ?? "-")}</strong>
              <span className="sr-only">{`姓名：${String(detail.health_snapshot.profile?.name ?? "-")}`}</span>
            </div>
            <div>
              <span>风险</span>
              <ClinicalStatusBadge type="risk" value={selected?.risk_level} />
            </div>
            <div>
              <span>处方</span>
              <strong>{`处方 #${selected?.prescription_id ?? detail.prescription.id}`}</strong>
            </div>
          </div>
          <dl className="lab-value-list expert-summary-labs" aria-label="用户关键医学指标">
            {clinicalLabRows(detail).map((row) => (
              <div className={`lab-value-row lab-value-${row.tone}`} key={`${row.group}-${row.label}`}>
                <dt>
                  <span>{row.group}</span>
                  <strong>{row.label}</strong>
                </dt>
                <dd>
                  <strong>{row.value}</strong>
                  {row.unit ? <span>{row.unit}</span> : null}
                  <small>{row.note}</small>
                </dd>
              </div>
            ))}
          </dl>
          <Collapse
            className="expert-summary-collapse"
            size="small"
            ghost
            items={[
              {
                key: "six-data",
                label: "六类数据",
                children: (
                  <Space direction="vertical" size={4} className="onboarding-section">
                    {sixDataLines(detail).map((line) => (
                      <Typography.Text key={line}>{line}</Typography.Text>
                    ))}
                  </Space>
                )
              },
              {
                key: "trend-version",
                label: "趋势与历史版本",
                children: (
                  <Space direction="vertical" size={4} className="onboarding-section">
                    <Typography.Text>{trendLine(detail)}</Typography.Text>
                    {versionLines(detail, selected).map((line) => (
                      <Typography.Text key={line}>{line}</Typography.Text>
                    ))}
                  </Space>
                )
              }
            ]}
          />
        </div>
      ) : (
        <div className="expert-patient-summary">
          {selected ? (
            <div className="expert-patient-strip">
              <div>
                <span>处方</span>
                <strong>{`处方 #${selected.prescription_id}`}</strong>
              </div>
              <div>
                <span>用户</span>
                <strong>{`#${selected.user_id}`}</strong>
              </div>
              <div>
                <span>风险</span>
                <ClinicalStatusBadge type="risk" value={selected.risk_level} />
              </div>
              <div>
                <span>状态</span>
                <ClinicalStatusBadge type="review" value={selected.status} />
              </div>
            </div>
          ) : null}
          <Typography.Paragraph className="expert-summary-empty">
            {detailError ? detailErrorMessage : "打开单个审核任务后查看用户关键安全摘要。"}
          </Typography.Paragraph>
        </div>
      )}
    </Card>
  );
}

function DetailGatePanel({
  selected,
  message,
  startLabel,
  onStart,
  secondaryAction
}: {
  selected: ReviewQueueItem | null;
  message: string;
  startLabel: string;
  onStart: () => void;
  secondaryAction?: ReactNode;
}) {
  return (
    <Card className="expert-panel expert-detail-gate-card">
      <div className="expert-detail-gate">
        <div>
          <Typography.Text type="secondary">{selected ? `处方 #${selected.prescription_id}` : "未选择任务"}</Typography.Text>
          <Typography.Title level={3}>先领取任务，再进入审核详情</Typography.Title>
          <Typography.Paragraph>{message}</Typography.Paragraph>
        </div>
        <div className="expert-detail-gate-steps" aria-label="领取后展示的审核内容">
          <div>
            <strong>1</strong>
            <span>领取任务</span>
            <small>写入审计状态</small>
          </div>
          <div>
            <strong>2</strong>
            <span>查看详情</span>
            <small>用户摘要、处方和证据</small>
          </div>
          <div>
            <strong>3</strong>
            <span>分步处理</span>
            <small>修改、转介或发布</small>
          </div>
        </div>
        <Space wrap className="expert-detail-gate-actions">
          <Button type="primary" disabled={!selected} onClick={onStart}>
            {startLabel}
          </Button>
          {secondaryAction}
          <Link to="/expert/reviews">
            <Button>返回审核队列</Button>
          </Link>
        </Space>
      </div>
    </Card>
  );
}

function ReadOnlyPrescriptionPreview({ detail }: { detail: ReviewDetail | null }) {
  const fitt = detail?.prescription.fitt_vp ?? {};
  const evidenceCount = (detail?.risk_rules ?? []).length + (detail?.evidence_refs ?? []).length;
  return (
    <div className="readonly-prescription-preview" aria-label="领取前处方只读预览">
      <Alert
        className="form-alert"
        type="info"
        showIcon
        message="只读预览"
        description="当前只展示处方结构、风险边界和证据概览。开始审核后才可编辑 FITT-VP 参数或发布处方。"
      />
      <div className="review-compare-grid">
        <section className="review-compare-panel">
          <Typography.Text strong>处方结构</Typography.Text>
          <Space direction="vertical" size={4}>
            {fittLines(fitt).map((line) => (
              <Typography.Text key={line}>{line}</Typography.Text>
            ))}
          </Space>
        </section>
        <section className="review-compare-panel">
          <Typography.Text strong>安全边界</Typography.Text>
          <Space direction="vertical" size={4}>
            <Typography.Text>{`注意事项：${displayValue(detail?.prescription.precautions)}`}</Typography.Text>
            <Typography.Text>{`禁忌动作：${displayValue(detail?.prescription.contraindications)}`}</Typography.Text>
            <Typography.Text>{`复评安排：${displayValue(detail?.prescription.reassessment)}`}</Typography.Text>
            <Typography.Text>{`安全提示：${displayValue(detail?.prescription.safety_notice)}`}</Typography.Text>
          </Space>
        </section>
        <section className="review-compare-panel">
          <Typography.Text strong>证据概览</Typography.Text>
          <Space direction="vertical" size={4}>
            <Typography.Text>{`已关联 ${evidenceCount} 条规则/证据。`}</Typography.Text>
            <Typography.Text>{`模板来源：${displayValue(detail?.template?.name, "暂无模板来源")}`}</Typography.Text>
            <Typography.Text type="secondary">完整证据请切换到右侧“证据”标签核对。</Typography.Text>
          </Space>
        </section>
      </div>
    </div>
  );
}

export function ExpertReviewPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routePrescriptionId = id && Number.isFinite(Number(id)) ? Number(id) : null;
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selected, setSelected] = useState<ReviewQueueItem | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueError, setQueueError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [editorDirty, setEditorDirty] = useState(false);
  const [filters, setFilters] = useState<ReviewQueueFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [detailErrorMessage, setDetailErrorMessage] = useState("审核详情加载失败，请重新选择任务或稍后重试。");
  const [queuePage, setQueuePage] = useState(1);
  const editorDirtyRef = useRef(false);

  const pickSelected = useCallback((data: ReviewQueueItem[]) => {
    if (routePrescriptionId) {
      return data.find((item) => item.prescription_id === routePrescriptionId) ?? data[0] ?? null;
    }
    return data[0] ?? null;
  }, [routePrescriptionId]);

  const refreshQueue = useCallback(async (nextFilters: ReviewQueueFilters) => {
    try {
      const data = await listReviewQueue(nextFilters);
      setQueueError(false);
      setItems(data);
      setSelected(pickSelected(data));
    } catch {
      setQueueError(true);
      setItems([]);
      setSelected(null);
    }
  }, [pickSelected]);

  useEffect(() => {
    void refreshQueue({});
    getReviewStats().then(setStats).catch(() => setStats(null));
  }, [refreshQueue]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(false);
      setDetailErrorMessage("审核详情加载失败，请重新选择任务或稍后重试。");
      editorDirtyRef.current = false;
      setEditorDirty(false);
      setEditor(emptyEditor);
      setReviewComment("");
      return;
    }
    if (location.pathname === "/expert/dashboard" || location.pathname === "/expert/reviews") {
      setDetail(null);
      setDetailError(false);
      setDetailErrorMessage("审核详情加载失败，请重新选择任务或稍后重试。");
      editorDirtyRef.current = false;
      setEditorDirty(false);
      setEditor(emptyEditor);
      setReviewComment("");
      return;
    }
    editorDirtyRef.current = false;
    setEditorDirty(false);
    setDetailError(false);
    getReviewDetail(selected.prescription_id)
      .then((data) => {
        setDetail(data);
        setDetailError(false);
        setDetailErrorMessage("审核详情加载失败，请重新选择任务或稍后重试。");
      })
      .catch((error) => {
        setDetail(null);
        setDetailError(true);
        setDetailErrorMessage(
          isForbiddenError(error)
            ? "当前接口未开放领取前详情，请先领取任务后查看完整审核详情。"
            : "审核详情加载失败，请重新选择任务或稍后重试。"
        );
      });
  }, [location.pathname, selected]);

  useEffect(() => {
    if (detail && !editorDirtyRef.current) {
      setEditor(editorFromDetail(detail));
    }
  }, [detail, editorDirty]);

  useEffect(() => {
    setReviewComment(String(detail?.review?.review_comment ?? ""));
  }, [detail?.review?.id, detail?.review?.review_comment]);

  function updateEditor(key: keyof EditorState, value: string) {
    editorDirtyRef.current = true;
    setEditorDirty(true);
    setEditor((current) => ({ ...current, [key]: value }));
  }

  function editedPrescription() {
    return {
      fitt_vp: {
        frequency: editor.frequency,
        intensity: editor.intensity,
        time: editor.time,
        type: splitList(editor.type),
        volume: editor.volume,
        progression: editor.progression
      },
      precautions: splitList(editor.precautions),
      contraindications: splitList(editor.contraindications),
      reassessment: editor.reassessment,
      safety_notice: editor.safety_notice
    };
  }

  async function applyFilters() {
    const cleaned: ReviewQueueFilters = {};
    if (filters.risk_level) cleaned.risk_level = filters.risk_level;
    if (filters.status) cleaned.status = filters.status;
    if (filters.organization_id) cleaned.organization_id = Number(filters.organization_id);
    if (filters.prescription_type) cleaned.prescription_type = filters.prescription_type;
    if (filters.abnormal_feedback) cleaned.abnormal_feedback = true;
    if (filters.start_date) cleaned.start_date = filters.start_date;
    if (filters.end_date) cleaned.end_date = filters.end_date;
    setFilters(cleaned);
    await refreshQueue(cleaned);
    setFilterOpen(false);
  }

  async function handleAction(action: "approve" | "reject" | "refer" | "requestInfo" | "pause") {
    if (!selected) {
      return;
    }
    const comment = reviewComment.trim() || defaultReviewComments[action];
    const payload = {
      review_comment: comment,
      edited_prescription: action === "approve" ? editedPrescription() : {}
    };
    try {
      if (action === "approve") {
        await approvePrescription(selected.prescription_id, payload);
      } else if (action === "reject") {
        await rejectPrescription(selected.prescription_id, payload);
      } else if (action === "refer") {
        await referPrescription(selected.prescription_id, payload);
      } else if (action === "requestInfo") {
        await requestMoreInformation(selected.prescription_id, payload);
      } else {
        await pausePrescription(selected.prescription_id, payload);
      }
      setNotice("审核操作已记录审计日志。");
      const queue = await listReviewQueue(filters);
      setItems(queue);
      setSelected(pickSelected(queue));
      editorDirtyRef.current = false;
      setEditorDirty(false);
    } catch {
      setNotice("审核操作失败，请检查处方状态和权限。");
    }
  }

  function requestApprove() {
    if (!selected) {
      return;
    }
    if (!detail || detailError) {
      setNotice("审核详情加载失败，暂不能发布处方。");
      return;
    }
    if ((detail?.prescription.risk_level ?? selected.risk_level) === "R3") {
      setNotice("R3 不允许发布训练处方，仅可建议医学评估 / 转介。");
      return;
    }
    setApproveConfirmed(false);
    setApproveConfirmOpen(true);
  }

  async function startReviewFor(item: ReviewQueueItem | null) {
    if (!item) {
      return false;
    }
    try {
      await startReviewRequest(item.prescription_id);
      setNotice(`已开始审核处方 #${item.prescription_id}，审核状态已写入审计日志。`);
      const queue = await listReviewQueue(filters);
      setItems(queue);
      setSelected(pickSelected(queue));
      return true;
    } catch {
      setNotice("开始审核失败，请检查处方状态和权限。");
      return false;
    }
  }

  async function startReview() {
    await startReviewFor(selected);
  }

  async function startAndOpen(item: ReviewQueueItem) {
    const ok = await startReviewFor(item);
    if (ok) {
      navigate(`/expert/reviews/${item.prescription_id}`);
    }
  }

  async function confirmApprove() {
    setApproveConfirmOpen(false);
    await handleAction("approve");
  }

  const isR3Review = (detail?.prescription.risk_level ?? selected?.risk_level) === "R3";
  const canPublishReview = Boolean(selected && detail && !detailError && !isR3Review);
  const isReadOnlyPreview = Boolean(selected && detail && !detailError && selected.status === "PENDING_REVIEW");
  const isDetailGate = Boolean(selected && detailError);
  const isStartGate = detailErrorMessage.includes("领取");
  const queueItems = [...items].sort((a, b) => priorityScore(b) - priorityScore(a) || b.prescription_id - a.prescription_id);
  const queuePageSize = 10;
  const currentQueuePage = Math.min(queuePage, Math.max(1, Math.ceil(queueItems.length / queuePageSize)));
  const pagedQueueItems = queueItems.slice((currentQueuePage - 1) * queuePageSize, currentQueuePage * queuePageSize);
  const queuePreview = selected ?? queueItems[0] ?? null;

  if (location.pathname === "/expert/dashboard") {
    const abnormalItems = items.filter((item) => item.abnormal_feedback_count > 0 || item.risk_level === "R3");
    const r3Count = items.filter((item) => item.risk_level === "R3").length;
    const pendingCount = items.filter((item) => item.status === "PENDING_REVIEW").length;
    const abnormalCount = items.filter((item) => item.abnormal_feedback_count > 0).length;
    return (
      <AppShell
        role="expert"
        title="专家分诊队列"
        subtitle="先处理 R3、异常反馈、超时和待领取任务"
        statusItems={
          <>
            <ClinicalStatusBadge type="review" value="pending_review" label={`${pendingCount} 待领取`} />
            <ClinicalStatusBadge type="risk" value={r3Count ? "R3" : "R2"} label={`${r3Count} 个 R3`} />
          </>
        }
      >
        <div className="expert-review-content">
          <DecisionBanner
            tone={r3Count || abnormalCount || (stats?.timeout_count ?? 0) ? "warning" : "safe"}
            title="先分诊，再审核"
            description={`当前队列 ${items.length} 项，R2 待审 ${stats?.r2_pending_count ?? 0} 项，超时 ${stats?.timeout_count ?? 0} 项。优先处理 R3 转介、异常反馈和超时任务。`}
            actions={
              <Link to="/expert/reviews">
                <Button type="primary">处理最高优先级</Button>
              </Link>
            }
          />
          {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <div className="status-grid">
            <StatusTile label="R3 转介" value={r3Count} detail="不发布训练处方" tone={r3Count ? "danger" : "neutral"} />
            <StatusTile label="异常反馈" value={abnormalCount} detail="优先核查停止信号" tone={abnormalCount ? "warning" : "neutral"} />
            <StatusTile label="超时任务" value={stats?.timeout_count ?? 0} detail="超过审核 SLA" tone={(stats?.timeout_count ?? 0) ? "warning" : "neutral"} />
            <StatusTile label="待领取" value={pendingCount} detail={`平均 ${stats?.average_review_hours ?? 0} 小时`} tone={pendingCount ? "info" : "neutral"} />
          </div>
          <WorkbenchSection title="分诊工作桶" description="按安全优先级处理，不从图表里找任务。">
            <div className="expert-bucket-grid">
              {expertWorkBuckets(items, stats).map((bucket) => (
                <Link
                  to="/expert/reviews"
                  className={`expert-bucket-card expert-bucket-${bucket.tone}`}
                  key={bucket.title}
                >
                  <span>{bucket.title}</span>
                  <strong>{bucket.count}</strong>
                  <small>{bucket.detail}</small>
                </Link>
              ))}
            </div>
          </WorkbenchSection>
          <WorkbenchSection title="优先处理列表" description="R3 和异常反馈显示在最前，避免专家先处理低风险任务。">
              <div className="priority-inbox-panel">
                <List
                  dataSource={abnormalItems}
                  locale={{ emptyText: "暂无异常反馈或 R3 转介任务" }}
                  renderItem={(item) => (
                    <List.Item className="priority-inbox-item">
                      <Link className="priority-inbox-row" to={`/expert/reviews/${item.prescription_id}`}>
                        <Space direction="vertical" size={4}>
                        <Typography.Text strong>{`处方 #${item.prescription_id}`}</Typography.Text>
                        <Space wrap>
                          <Tag color={item.risk_level === "R3" ? "red" : "orange"}>{item.risk_level}</Tag>
                          <Tag color={statusTagColor(item.status)}>{formatStatusLabel(item.status, "review")}</Tag>
                          <Tag color={priorityMeta(item).color}>{`优先级 ${priorityMeta(item).label}`}</Tag>
                          <Typography.Text type="secondary">{`异常反馈 ${item.abnormal_feedback_count}`}</Typography.Text>
                        </Space>
                        </Space>
                        <Typography.Text type="secondary">查看详情</Typography.Text>
                      </Link>
                    </List.Item>
                  )}
                />
              </div>
          </WorkbenchSection>
          <WorkbenchSection title="队列结构" description="图表用于判断积压结构，具体处理顺序以分诊桶和优先列表为准。">
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <ChartCard
                  title="审核队列按风险/状态分布"
                  unit="项"
                  insight="用于观察积压结构，具体处理顺序仍以 R3、异常反馈和超时为先。"
                  threshold="R3 或异常反馈出现时不从普通队列顺序处理。"
                >
                  <ExpertQueueChart data={queueChartData(items)} />
                </ChartCard>
              </Col>
              <Col xs={24} lg={12}>
                <ChartCard
                  title="待审风险分布"
                  unit="项"
                  insight="用于判断专家资源是否被高风险任务占用。"
                  threshold="R3 只给医学评估/转介，不发布训练处方。"
                >
                  <RiskDistributionChart data={riskDistributionData(items)} />
                </ChartCard>
              </Col>
            </Row>
          </WorkbenchSection>
        </div>
      </AppShell>
    );
  }

  if (location.pathname === "/expert/reviews") {
    const r3Count = items.filter((item) => item.risk_level === "R3").length;
    const pendingCount = items.filter((item) => item.status === "PENDING_REVIEW").length;
    const abnormalCount = items.filter((item) => item.abnormal_feedback_count > 0).length;
    return (
      <AppShell
        role="expert"
        title="专家审核队列"
        subtitle="先分诊，后进入单个审核任务；队列页不展示处方编辑。"
        statusItems={
          <>
            <ClinicalStatusBadge type="review" value="pending_review" label={`${pendingCount} 待领取`} />
            <ClinicalStatusBadge type="risk" value={r3Count ? "R3" : "R2"} label={`${r3Count} 个 R3`} />
          </>
        }
      >
        <div className="expert-review-content expert-queue-page">
          {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <DecisionBanner
            tone={r3Count || abnormalCount || (stats?.timeout_count ?? 0) ? "warning" : "info"}
            title="队列只做分诊和领取"
            description="把审核队列从处方编辑里拆出来，先按风险、异常反馈和超时状态确定处理顺序，再打开单个任务。"
            actions={
              queuePreview ? (
                requiresStartBeforeDetail(queuePreview) ? (
                  <Button type="primary" danger={queuePreview.risk_level === "R3"} onClick={() => void startAndOpen(queuePreview)}>
                    处理最高优先级
                  </Button>
                ) : (
                  <Link to={`/expert/reviews/${queuePreview.prescription_id}`}>
                    <Button type="primary" danger={queuePreview.risk_level === "R3"}>处理最高优先级</Button>
                  </Link>
                )
              ) : null
            }
          />
          <div className="status-grid expert-review-metrics">
            <StatusTile label="R3 转介" value={r3Count} detail="只进入医学评估处理" tone={r3Count ? "danger" : "neutral"} />
            <StatusTile label="异常反馈" value={abnormalCount} detail="优先核查停止信号" tone={abnormalCount ? "warning" : "neutral"} />
            <StatusTile label="待领取" value={pendingCount} detail={`超时 ${stats?.timeout_count ?? 0} 项`} tone={pendingCount ? "info" : "neutral"} />
          </div>

          <Drawer
            title="筛选审核队列"
            width={420}
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            destroyOnClose
          >
            <Space direction="vertical" size={12} className="onboarding-section">
              <label htmlFor="review-risk-level-list">风险等级</label>
              <Select
                id="review-risk-level-list"
                allowClear
                value={filters.risk_level}
                onChange={(value) => setFilters((current) => ({ ...current, risk_level: value || undefined }))}
                options={["R2", "R3"].map((value) => ({ value, label: value }))}
              />
              <label htmlFor="review-status-list">审核状态</label>
              <Select
                id="review-status-list"
                allowClear
                value={filters.status}
                onChange={(value) => setFilters((current) => ({ ...current, status: value || undefined }))}
                options={["PENDING_REVIEW", "IN_REVIEW", "APPROVED", "REJECTED", "REFERRED"].map((value) => ({ value, label: formatStatusLabel(value, "review") }))}
              />
              <label htmlFor="review-organization-list">机构</label>
              <Input id="review-organization-list" type="number" value={filters.organization_id ?? ""} onChange={(event) => setFilters((current) => ({ ...current, organization_id: event.target.value ? Number(event.target.value) : undefined }))} />
              <label htmlFor="review-prescription-type-list">处方类型</label>
              <Input id="review-prescription-type-list" value={filters.prescription_type ?? ""} onChange={(event) => setFilters((current) => ({ ...current, prescription_type: event.target.value || undefined }))} />
              <label htmlFor="review-start-date-list">开始日期</label>
              <Input id="review-start-date-list" type="date" value={filters.start_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value || undefined }))} />
              <label htmlFor="review-end-date-list">结束日期</label>
              <Input id="review-end-date-list" type="date" value={filters.end_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value || undefined }))} />
              <Checkbox aria-label="仅异常反馈" checked={Boolean(filters.abnormal_feedback)} onChange={(event) => setFilters((current) => ({ ...current, abnormal_feedback: event.target.checked || undefined }))}>
                仅异常反馈
              </Checkbox>
              <Space>
                <Button type="primary" aria-label="应用筛选" onClick={applyFilters}>应用筛选</Button>
                <Button
                  onClick={() => {
                    setFilters({});
                    void refreshQueue({});
                    setFilterOpen(false);
                  }}
                >
                  清空筛选
                </Button>
              </Space>
            </Space>
          </Drawer>

          <DataWorkbench
            className="expert-review-workbench"
            filters={
              <div className="expert-filterbar">
                <Typography.Text strong>优先级工作台</Typography.Text>
                <Typography.Text type="secondary">
                  {activeFilterCount(filters) ? `已启用 ${activeFilterCount(filters)} 个筛选` : "默认选中最高优先级任务"}
                </Typography.Text>
                <Button onClick={() => setFilterOpen(true)}>筛选队列</Button>
              </div>
            }
            main={
              <section className="expert-queue-main" aria-label="审核队列">
                <Card
                  title={
                    <div className="expert-queue-card-title">
                      <span>待处理任务</span>
                      <Typography.Text type="secondary">{`共 ${queueItems.length} 项`}</Typography.Text>
                    </div>
                  }
                  className="expert-panel expert-queue-card"
                >
                  {queueError ? (
                    <Alert type="error" showIcon message="审核队列加载失败，请确认专家权限或稍后重试。" />
                  ) : queueItems.length ? (
                    <div className="expert-queue-table-shell">
                      <div className="expert-queue-table-wrap">
                        <table className="expert-queue-table" aria-label="审核队列表格">
                          <thead>
                            <tr>
                              <th scope="col">任务</th>
                              <th scope="col">风险/状态</th>
                              <th scope="col">处方类型</th>
                              <th scope="col">分诊原因</th>
                              <th scope="col">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedQueueItems.map((item) => {
                              const priority = priorityMeta(item);
                              const needsStart = requiresStartBeforeDetail(item);
                              return (
                                <tr
                                  key={item.prescription_id}
                                  className={queuePreview?.prescription_id === item.prescription_id ? "is-selected" : undefined}
                                  onClick={() => setSelected(item)}
                                >
                                  <th scope="row">
                                    <Typography.Text strong>{`处方 #${item.prescription_id}`}</Typography.Text>
                                    <span className={`review-priority-pill review-priority-${priority.tone}`}>{priority.label}</span>
                                  </th>
                                  <td>
                                    <Space wrap size={[6, 6]}>
                                      <Tag color={item.risk_level === "R3" ? "red" : "orange"}>{item.risk_level}</Tag>
                                      <Tag color={statusTagColor(item.status)}>{formatStatusLabel(item.status, "review")}</Tag>
                                    </Space>
                                  </td>
                                  <td>{prescriptionTypeLabel(item.prescription_type)}</td>
                                  <td>
                                    <Typography.Text className="expert-queue-page-reason" type="secondary">
                                      {priorityReason(item)}
                                    </Typography.Text>
                                  </td>
                                  <td>
                                    {needsStart ? (
                                      <Button
                                        type="default"
                                        danger={item.risk_level === "R3"}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void startAndOpen(item);
                                        }}
                                      >
                                        {queueActionLabel(item)}
                                      </Button>
                                    ) : (
                                      <Link to={`/expert/reviews/${item.prescription_id}`} onClick={(event) => event.stopPropagation()}>
                                        <Button danger={item.risk_level === "R3"}>{queueActionLabel(item)}</Button>
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        current={currentQueuePage}
                        pageSize={queuePageSize}
                        total={queueItems.length}
                        showSizeChanger={false}
                        onChange={(page) => setQueuePage(page)}
                      />
                    </div>
                  ) : (
                    <Empty description="暂无待审核处方" />
                  )}
                </Card>
              </section>
            }
            detail={
              <div className="expert-queue-side" aria-label="处理原则">
                <Card title="选中任务预览" className="expert-panel expert-queue-preview-card">
                  {queuePreview ? (
                    <Space direction="vertical" size={10} className="onboarding-section">
                      <div className="expert-preview-title">
                        <Typography.Text strong>{`选中任务 #${queuePreview.prescription_id}`}</Typography.Text>
                        <Tag color={priorityMeta(queuePreview).color}>{`优先级 ${priorityMeta(queuePreview).label}`}</Tag>
                      </div>
                      <Space wrap size={[6, 6]}>
                        <ClinicalStatusBadge type="risk" value={queuePreview.risk_level} />
                        <ClinicalStatusBadge type="review" value={queuePreview.status} />
                      </Space>
                      <Typography.Paragraph>{priorityReason(queuePreview)}</Typography.Paragraph>
                      <Space wrap size={[6, 6]}>
                        <Typography.Text type="secondary">{`用户 #${queuePreview.user_id}`}</Typography.Text>
                        <Typography.Text type="secondary">{`版本 ${queuePreview.version}`}</Typography.Text>
                        <Tag color={queuePreview.abnormal_feedback_count ? "orange" : "default"}>{`异常反馈 ${queuePreview.abnormal_feedback_count}`}</Tag>
                      </Space>
                      <ActionBar
                        secondary={
                          requiresStartBeforeDetail(queuePreview) ? (
                            <Button
                              danger={queuePreview.risk_level === "R3"}
                              onClick={() => void startAndOpen(queuePreview)}
                            >
                              处理选中任务
                            </Button>
                          ) : (
                            <Link to={`/expert/reviews/${queuePreview.prescription_id}`}>
                              <Button danger={queuePreview.risk_level === "R3"}>处理选中任务</Button>
                            </Link>
                          )
                        }
                      />
                    </Space>
                  ) : (
                    <Empty description="暂无选中任务" />
                  )}
                </Card>
                <Card title="处理原则" className="expert-panel">
                  <div className="expert-priority-rules">
                    <div>
                      <strong>1</strong>
                      <span>R3 只做医学评估/转介，不进入训练处方编辑。</span>
                    </div>
                    <div>
                      <strong>2</strong>
                      <span>异常反馈优先于普通待审，先排除停止信号。</span>
                    </div>
                    <div>
                      <strong>3</strong>
                      <span>单个任务打开后再看画像、证据和审核意见。</span>
                    </div>
                  </div>
                </Card>
                <Card title="队列结构" className="expert-panel expert-queue-chart-card">
                  <ExpertQueueChart data={queueChartData(items)} />
                </Card>
              </div>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      role="expert"
      title={isR3Review ? "医学评估/转介处理" : "处方审核详情"}
      subtitle={selected ? `处方 #${selected.prescription_id} · ${selected.risk_level} · ${formatStatusLabel(selected.status, "review")}` : "从队列打开单个任务后处理"}
      statusItems={
        <>
          <ClinicalStatusBadge type="risk" value={selected?.risk_level} />
          <ClinicalStatusBadge type="review" value={selected?.status} />
        </>
      }
    >
      <div className="expert-review-content expert-detail-page">
        {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
        {queueError ? (
          <Alert className="form-alert" type="error" showIcon message="审核队列加载失败，请确认专家权限或稍后重试。" />
        ) : null}
        {detailError && !isStartGate ? (
          <Alert className="form-alert" type="error" showIcon message={detailErrorMessage} />
        ) : null}
        <DecisionBanner
          tone={isR3Review ? "danger" : detailError ? "warning" : selected ? "info" : "warning"}
          title={selected ? `当前审核：处方 #${selected.prescription_id}` : "请选择一个审核任务"}
          description={
            selected
              ? isR3Review
                ? "R3 任务只处理医学评估、转介和暂停运动，不展示训练处方编辑字段。"
                : isReadOnlyPreview
                  ? "当前为领取前只读预览。可以先查看用户摘要、处方结构和规则证据，开始审核后才能编辑或发布。"
                : "当前页面只处理单个审核任务，修改处方、核对证据和发布分步完成。"
              : "请从审核队列打开一个任务。"
          }
          meta={
            <>
              <ClinicalStatusBadge type="risk" value={selected?.risk_level} />
              <ClinicalStatusBadge type="review" value={selected?.status} />
              <ClinicalStatusBadge type="readiness" value={canPublishReview && !isReadOnlyPreview ? "ready" : "degraded"} label={isReadOnlyPreview ? "只读预览" : canPublishReview ? "可发布" : "待核对"} />
            </>
          }
        />
        <PatientSummaryPanel
          detail={detail}
          selected={selected}
          detailError={detailError}
          detailErrorMessage={detailErrorMessage}
        />
        {isDetailGate ? (
          <DetailGatePanel
            selected={selected}
            message={detailErrorMessage}
            startLabel={isStartGate ? "开始审核并查看详情" : "重新领取任务"}
            onStart={startReview}
            secondaryAction={
              !isStartGate ? (
                <Button onClick={() => void refreshQueue(filters)}>
                  重新加载队列
                </Button>
              ) : null
            }
          />
        ) : (
        <ReviewWorkbench>
          <section className="review-workbench-column review-workbench-column-editor" aria-label={isR3Review ? "医学评估转介处理" : "处方审核"}>
            <Card title={isR3Review ? "医学评估/转介处理" : "处方审核"} className="expert-panel">
              {isR3Review ? (
                <div className="referral-review-panel">
                  <Alert
                    className="form-alert"
                    type="error"
                    showIcon
                    message="R3 不进入训练处方编辑"
                    description="当前任务只能给出医学评估、转介或暂停运动处理，页面已隐藏频率、强度、时长等训练处方字段。"
                  />
                  <ForbiddenActionsPanel
                    tone="danger"
                    items={[
                      "不填写 FITT-VP 训练参数",
                      "不发布开始训练入口",
                      "不把转介建议改写成运动计划"
                    ]}
                  />
                  <div className="referral-next-grid">
                    <div>
                      <Typography.Text type="secondary">当前处理</Typography.Text>
                      <Typography.Title level={4}>医学评估 / 转介</Typography.Title>
                      <Typography.Paragraph>核对 R3 命中规则、异常反馈和模板来源后，保留审计意见并通知用户暂停训练。</Typography.Paragraph>
                    </div>
                    <div>
                      <Typography.Text type="secondary">可执行动作</Typography.Text>
                      <div className="review-item-tags">
                        <ClinicalStatusBadge type="review" value="referred" label="转介" />
                        <ClinicalStatusBadge type="exercise" value={false} label="暂停运动" />
                        <ClinicalStatusBadge type="review" value="rejected" label="驳回重生成" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : isReadOnlyPreview ? (
                <ReadOnlyPrescriptionPreview detail={detail} />
              ) : (
                <>
                  <PrescriptionEditor>
                    <div className="prescription-editor-grid">
                      <EditorField id="expert-frequency" label="频率">
                        <Input id="expert-frequency" disabled={isReadOnlyPreview} value={editor.frequency} onChange={(event) => updateEditor("frequency", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-intensity" label="强度">
                        <Input id="expert-intensity" disabled={isReadOnlyPreview} value={editor.intensity} onChange={(event) => updateEditor("intensity", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-time" label="时间">
                        <Input id="expert-time" disabled={isReadOnlyPreview} value={editor.time} onChange={(event) => updateEditor("time", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-type" label="类型">
                        <Input id="expert-type" disabled={isReadOnlyPreview} value={editor.type} onChange={(event) => updateEditor("type", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-volume" label="总量">
                        <Input id="expert-volume" disabled={isReadOnlyPreview} value={editor.volume} onChange={(event) => updateEditor("volume", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-progression" label="进阶">
                        <Input id="expert-progression" disabled={isReadOnlyPreview} value={editor.progression} onChange={(event) => updateEditor("progression", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-precautions" label="注意事项" wide>
                        <Input.TextArea id="expert-precautions" disabled={isReadOnlyPreview} rows={2} value={editor.precautions} onChange={(event) => updateEditor("precautions", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-contraindications" label="禁忌动作" wide>
                        <Input.TextArea id="expert-contraindications" disabled={isReadOnlyPreview} rows={2} value={editor.contraindications} onChange={(event) => updateEditor("contraindications", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-reassessment" label="复评安排">
                        <Input id="expert-reassessment" disabled={isReadOnlyPreview} value={editor.reassessment} onChange={(event) => updateEditor("reassessment", event.target.value)} />
                      </EditorField>
                      <EditorField id="expert-safety-notice" label="安全提示" wide>
                        <Input.TextArea id="expert-safety-notice" disabled={isReadOnlyPreview} rows={2} value={editor.safety_notice} onChange={(event) => updateEditor("safety_notice", event.target.value)} />
                      </EditorField>
                    </div>
                  </PrescriptionEditor>
                  <div className="review-compare-grid">
                    <section className="review-compare-panel">
                      <Typography.Text strong>系统初稿</Typography.Text>
                        <Space direction="vertical" size={4}>
                          {fittLines((detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? detail?.prescription.fitt_vp).map((line) => (
                            <Typography.Text key={line}>{line}</Typography.Text>
                          ))}
                        </Space>
                    </section>
                    <section className="review-compare-panel">
                      <Typography.Text strong>结构化差异</Typography.Text>
                        <Space direction="vertical" size={4}>
                          {structuredDiffLines(detail).map((line) => (
                            <Typography.Text key={line}>{line}</Typography.Text>
                          ))}
                        </Space>
                    </section>
                  </div>
                </>
              )}
              <div className="review-state-machine">
                <ClinicalStatusBadge type="review" value={selected ? "in_review" : "pending"} label={selected ? "1 领取任务" : "选择任务"} />
                <ClinicalStatusBadge type="review" value={editorDirty ? "in_review" : "pending"} label="2 修改处方" />
                <ClinicalStatusBadge type="review" value={canPublishReview ? "approved" : "blocked"} label="3 发布门槛" />
              </div>
              <ActionBar
                className="review-action-bar"
                secondary={
                  <Space wrap>
                  <Button aria-label={isReadOnlyPreview ? "开始审核并解锁编辑" : "开始审核"} disabled={!selected} onClick={startReview}>
                    {isReadOnlyPreview ? "开始审核并解锁编辑" : "开始审核"}
                  </Button>
                  {!isReadOnlyPreview ? (
                    <>
                      <Button aria-label="驳回重生成" disabled={!selected} onClick={() => handleAction("reject")}>
                        驳回重生成
                      </Button>
                      <Button aria-label="要求补充资料" disabled={!selected} onClick={() => handleAction("requestInfo")}>
                        要求补充资料
                      </Button>
                    </>
                  ) : null}
                  </Space>
                }
                danger={
                  !isReadOnlyPreview ? (
                    <Space wrap>
                    <Button danger aria-label="转介" disabled={!selected} onClick={() => handleAction("refer")}>
                      医学评估/转介
                    </Button>
                    <Button danger aria-label="暂停运动" disabled={!selected} onClick={() => handleAction("pause")}>
                      暂停运动
                    </Button>
                    </Space>
                  ) : null
                }
                primary={
                  isR3Review || isReadOnlyPreview ? null : (
                    <Button type="primary" disabled={!canPublishReview} onClick={requestApprove}>
                      核对后发布处方
                    </Button>
                  )
                }
              />
            </Card>
          </section>
          <section className="review-workbench-column review-workbench-column-evidence" aria-label="规则证据与审计">
            <Card title="规则证据" className="expert-panel">
              <Tabs
                size="small"
                items={[
                  {
                    key: "rules",
                    label: "规则",
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <EvidenceTimeline
                          items={[
                            {
                              title: "规则命中",
                              description: (detail?.risk_rules ?? []).length
                                ? (detail?.risk_rules ?? []).map((rule) => sanitizeDisplayText(rule.code ?? rule.message ?? "规则")).join("；")
                                : "暂无规则命中",
                              status: "done"
                            },
                            {
                              title: "模板来源",
                              description: String(detail?.template?.name ?? "暂无模板来源"),
                              status: "active"
                            },
                            {
                              title: "禁忌动作",
                              description: (detail?.prescription.contraindications ?? []).join("；") || "暂无禁忌动作",
                              status: "pending"
                            }
                          ]}
                        />
                        {(detail?.risk_rules ?? []).length ? (
                          (detail?.risk_rules ?? []).slice(0, 3).map((rule) => (
                            <RuleHitCard key={`rule-${String(rule.code)}`} rule={rule} />
                          ))
                        ) : (
                          <Typography.Text type="secondary">暂无规则命中</Typography.Text>
                        )}
                      </Space>
                    )
                  },
                  {
                    key: "evidence",
                    label: "证据",
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        {(detail?.evidence_refs ?? []).length ? (
                          <Collapse
                            size="small"
                            className="evidence-accordion"
                            defaultActiveKey={[
                              `evidence-${String((detail?.evidence_refs ?? [])[0]?.chunk_id ?? 0)}`
                            ]}
                            items={(detail?.evidence_refs ?? []).slice(0, 4).map((item, index) => ({
                              key: `evidence-${String(item.chunk_id ?? index)}`,
                              label: sanitizeDisplayText(item.document_title ?? item.source ?? `证据 ${index + 1}`),
                              children: (
                                <Space direction="vertical" size={6} className="onboarding-section">
                                  <EvidenceCard evidence={item} />
                                  {item.quote ? <Typography.Text type="secondary">{sanitizeDisplayText(item.quote)}</Typography.Text> : null}
                                  <Typography.Text type="secondary">{`Chunk：${String(item.chunk_id ?? "-")}`}</Typography.Text>
                                </Space>
                              )
                            }))}
                          />
                        ) : (
                          <Typography.Text type="secondary">暂无 RAG 证据</Typography.Text>
                        )}
                        <Typography.Text strong>模板与动作</Typography.Text>
                        <Typography.Text>{String(detail?.template?.name ?? "-")}</Typography.Text>
                        {(detail?.candidate_actions ?? []).slice(0, 3).map((action, index) => (
                          <Typography.Text key={`action-${String(action.id ?? action.name ?? index)}-${index}`}>{String(action.name)}：禁忌 {String((action.contraindication_tags as string[] | undefined)?.join("、") ?? "-")}</Typography.Text>
                        ))}
                      </Space>
                    )
                  },
                  {
                    key: "audit",
                    label: "审计",
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <label htmlFor="expert-review-comment">审核意见</label>
                        <Input.TextArea
                          id="expert-review-comment"
                          rows={4}
                          value={reviewComment}
                          onChange={(event) => setReviewComment(event.target.value)}
                          placeholder="填写审核意见、补充资料要求或转介建议"
                        />
                        <AuditTrail
                          items={[
                            detail?.review?.id ? `审核单 #${detail.review.id}` : "",
                            selected?.review_id ? `队列任务 #${selected.review_id}` : "",
                            selected ? `当前状态 ${formatStatusLabel(selected.status, "review")}` : ""
                          ].filter(Boolean)}
                        />
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          </section>
        </ReviewWorkbench>
        )}
        <Link to="/">
          <Button className="back-button">返回首页</Button>
        </Link>
        <Modal
          title="已核对风险规则、禁忌动作和处方强度"
          open={approveConfirmOpen}
          onCancel={() => setApproveConfirmOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setApproveConfirmOpen(false)}>
              取消
            </Button>,
            <Button key="confirm" type="primary" disabled={!approveConfirmed} onClick={confirmApprove}>
              确认发布
            </Button>
          ]}
        >
          <Space direction="vertical" size={12} className="onboarding-section">
            <Alert
              type="warning"
              showIcon
              message="发布后用户端将展示可执行处方，请确认安全边界已经复核。"
            />
            <Checkbox
              aria-label="确认已核对风险规则、禁忌动作和处方强度"
              checked={approveConfirmed}
              onChange={(event) => setApproveConfirmed(event.target.checked)}
            >
              确认已核对风险规则、禁忌动作和处方强度
            </Checkbox>
          </Space>
        </Modal>
      </div>
    </AppShell>
  );
}
