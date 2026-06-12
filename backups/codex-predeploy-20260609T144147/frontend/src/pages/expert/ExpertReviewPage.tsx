import { Alert, Button, Card, Checkbox, Col, DatePicker, Empty, Input, List, Modal, Row, Select, Space, Switch, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AlertTriangle, FileText, Stethoscope } from "lucide-react";

import {
  AppShell,
  AuditTrail,
  EvidenceTimeline,
  EvidenceCard,
  MetricCard,
  PageHero,
  PrescriptionEditor,
  ReviewWorkbench,
  RuleHitCard
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

type FittEditorKey = "frequency" | "intensity" | "time" | "type" | "volume" | "progression";

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

const fittEditorFields: Array<{ key: FittEditorKey; letter: string; label: string; placeholder: string; suffix?: string }> = [
  { key: "frequency", letter: "F", label: "频率", placeholder: "每周3-5次", suffix: "次/周" },
  { key: "intensity", letter: "I", label: "强度", placeholder: "低-中等强度 / RPE 11-13" },
  { key: "time", letter: "T", label: "时间", placeholder: "每次20-45分钟", suffix: "分钟" },
  { key: "type", letter: "T", label: "类型", placeholder: "快走，弹力带抗阻，灵活性训练" },
  { key: "volume", letter: "V", label: "总量", placeholder: "每周150分钟左右" },
  { key: "progression", letter: "P", label: "进阶", placeholder: "每2周按反馈微调" }
];

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
    const key = `${item.risk_level} ${item.status}`;
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
      `v${displayValue(version.version)} ${displayValue(version.status)} ${displayValue(version.change_reason)}`
    );
  }
  return selected ? [`v${selected.version} ${selected.status}`] : [];
}

function fittLines(fitt: Record<string, unknown> | null | undefined) {
  return Object.entries(fittLabels).map(([key, label]) => `${label}：${displayValue(fitt?.[key])}`);
}

function structuredDiffLines(detail: ReviewDetail | null) {
  const current = detail?.prescription.fitt_vp ?? {};
  const aiDraft = (detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? {};
  const lines = Object.entries(fittLabels)
    .filter(([key]) => displayValue(aiDraft[key]) !== displayValue(current[key]))
    .map(([key, label]) => `${label}：AI ${displayValue(aiDraft[key])} → 当前 ${displayValue(current[key])}`);
  return lines.length ? lines : ["AI 初稿与当前处方结构一致"];
}

function priorityMeta(item: ReviewQueueItem) {
  if (item.risk_level === "R3") {
    return { label: "最高", color: "red", border: "#ff4d4f" };
  }
  if (item.abnormal_feedback_count > 0 || item.status === "PENDING_REVIEW") {
    return { label: "高", color: "orange", border: "#fa8c16" };
  }
  return { label: "中", color: "blue", border: "#1677ff" };
}

function prescriptionTypeLabel(type: string) {
  const labels: Record<string, string> = { training: "训练处方", referral: "转介建议", adjustment: "复测调整" };
  return labels[type] ?? type;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_REVIEW: "待领取",
    IN_REVIEW: "审核中",
    NEEDS_INFO: "需补充",
    REFERRED: "已转介",
    APPROVED: "已批准",
    PAUSED: "已暂停"
  };
  return labels[status] ?? status;
}

function waitDuration(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) {
    return "等待 -";
  }
  const hours = Math.max(0, Math.round((Date.now() - created) / 36e5));
  if (hours < 24) {
    return `等待 ${hours} 小时`;
  }
  return `等待 ${Math.round(hours / 24)} 天`;
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

export function ExpertReviewPage() {
  const { id } = useParams();
  const location = useLocation();
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
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [detailErrorMessage, setDetailErrorMessage] = useState("审核详情加载失败，请重新选择任务或稍后重试。");
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
    editorDirtyRef.current = false;
    setEditorDirty(false);
    setDetailError(false);
    if (requiresStartBeforeDetail(selected)) {
      setDetail(null);
      setDetailError(true);
      setDetailErrorMessage("请先点击“开始审核”领取任务，再查看完整审核详情。");
      setEditor(emptyEditor);
      setReviewComment("");
      return;
    }
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
            ? "请先点击“开始审核”领取任务，再查看完整审核详情。"
            : "审核详情加载失败，请重新选择任务或稍后重试。"
        );
      });
  }, [selected]);

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

  async function startReview() {
    if (!selected) {
      return;
    }
    try {
      await startReviewRequest(selected.prescription_id);
      setNotice(`已开始审核处方 #${selected.prescription_id}，审核状态已写入审计日志。`);
      const queue = await listReviewQueue(filters);
      setItems(queue);
      setSelected(pickSelected(queue));
    } catch {
      setNotice("开始审核失败，请检查处方状态和权限。");
    }
  }

  async function confirmApprove() {
    setApproveConfirmOpen(false);
    await handleAction("approve");
  }

  const isR3Review = (detail?.prescription.risk_level ?? selected?.risk_level) === "R3";
  const canPublishReview = Boolean(selected && detail && !detailError && !isR3Review);
  const aiDraftFitt = (detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? {};
  const displayedDraftFitt = Object.keys(aiDraftFitt).length ? aiDraftFitt : detail?.prescription.fitt_vp;

  if (location.pathname === "/expert/dashboard") {
    const abnormalItems = items.filter((item) => item.abnormal_feedback_count > 0 || item.risk_level === "R3");
    return (
      <AppShell role="expert" title="专家工作台" subtitle="审核队列、风险分布和异常反馈优先级">
        <div className="expert-review-content">
          <PageHero
            eyebrow="专家端审核队列"
            title="优先处理 R2 待审、异常反馈和超时任务"
            summary={`当前队列 ${items.length} 项，R2 待审 ${stats?.r2_pending_count ?? 0} 项，超时 ${stats?.timeout_count ?? 0} 项。`}
            actions={
              <Link to="/expert/reviews">
                <Button type="primary">进入审核工作台</Button>
              </Link>
            }
          />
          {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={6}>
              <MetricCard title="待审数量" value={items.length} />
            </Col>
            <Col xs={24} md={6}>
              <MetricCard title="R2 待审" value={stats?.r2_pending_count ?? 0} />
            </Col>
            <Col xs={24} md={6}>
              <MetricCard title="超时任务" value={stats?.timeout_count ?? 0} />
            </Col>
            <Col xs={24} md={6}>
              <MetricCard title="平均审核时长" value={stats?.average_review_hours ?? 0} suffix="小时" />
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <ChartCard title="审核队列按风险/状态分布">
                <ExpertQueueChart data={queueChartData(items)} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="待审风险分布">
                <RiskDistributionChart data={riskDistributionData(items)} />
              </ChartCard>
            </Col>
            <Col xs={24}>
              <Card title="异常反馈提醒" className="dashboard-panel">
                <List
                  dataSource={abnormalItems}
                  locale={{ emptyText: "暂无异常反馈或 R3 转介任务" }}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Link key="review" to={`/expert/reviews/${item.prescription_id}`}>
                          <Button type="primary">进入审核</Button>
                        </Link>
                      ]}
                    >
                      <Space direction="vertical" size={4}>
                        <Typography.Text strong>{`处方 #${item.prescription_id}`}</Typography.Text>
                        <Space wrap>
                          <Tag color={item.risk_level === "R3" ? "red" : "orange"}>{item.risk_level}</Tag>
                          <Tag>{item.status}</Tag>
                          <Typography.Text type="secondary">{`异常反馈 ${item.abnormal_feedback_count}`}</Typography.Text>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="expert" title="专家审核工作台">
      <div className="expert-review-content">
        {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
        {detailError ? (
          <Alert className="form-alert" type="error" showIcon message={detailErrorMessage} />
        ) : null}
        <div className="expert-workbench-metrics" data-testid="expert-workbench-metrics">
          <div className="workbench-metric-item">
            <span>队列任务</span>
            <strong>{items.length}</strong>
          </div>
          <div className="workbench-metric-item">
            <span>R2 待审</span>
            <strong>{stats?.r2_pending_count ?? 0}</strong>
          </div>
          <div className="workbench-metric-item">
            <span>平均审核时长</span>
            <strong>{stats?.average_review_hours ?? 0}<small>小时</small></strong>
          </div>
          <div className="workbench-metric-item">
            <span>超时项</span>
            <strong>{stats?.timeout_count ?? 0}</strong>
          </div>
          <div className="workbench-metric-item">
            <span>异常反馈</span>
            <strong>{items.filter((item) => item.abnormal_feedback_count > 0).length}</strong>
          </div>
          <div className="workbench-metric-strip">
            <Tag color="orange">R2 {items.filter((item) => item.risk_level === "R2").length}</Tag>
            <Tag color="red">R3 {items.filter((item) => item.risk_level === "R3").length}</Tag>
            <Tag>{selected ? `当前 #${selected.prescription_id}` : "未选择"}</Tag>
          </div>
        </div>
        <ReviewWorkbench>
          <Col xs={24} lg={6} className="expert-left-column" data-testid="expert-left-column">
            <Card title="审核队列" className="expert-panel">
              <details className="expert-filter-details">
                <summary>
                  <span>筛选条件</span>
                  <Tag>{filters.risk_level || filters.status || filters.prescription_type || filters.abnormal_feedback ? "已设置" : "全部队列"}</Tag>
                </summary>
                <div className="expert-filter-grid" data-testid="expert-filter-grid">
                  <div className="expert-filter-row expert-filter-primary-row" data-testid="expert-filter-primary-row">
                  <div className="expert-filter-selects" data-testid="expert-filter-selects">
                  <div className="expert-filter-field">
                    <label htmlFor="review-risk-level">风险等级</label>
                    <Select
                      aria-label="风险等级选择"
                      size="small"
                      allowClear
                      placeholder="全部风险"
                      value={filters.risk_level}
                      options={["R2", "R3"].map((value) => ({ value, label: value }))}
                      onChange={(value) => setFilters((current) => ({ ...current, risk_level: value }))}
                    />
                    <Input className="filter-fallback-input" id="review-risk-level" size="small" value={filters.risk_level ?? ""} onChange={(event) => setFilters((current) => ({ ...current, risk_level: event.target.value || undefined }))} />
                  </div>
                  <div className="expert-filter-field">
                    <label htmlFor="review-status">审核状态</label>
                    <Select
                      aria-label="审核状态选择"
                      size="small"
                      allowClear
                      placeholder="全部状态"
                      value={filters.status}
                      options={["PENDING_REVIEW", "IN_REVIEW", "NEEDS_INFO", "REFERRED", "APPROVED", "PAUSED"].map((value) => ({ value, label: statusLabel(value) }))}
                      onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
                    />
                    <Input className="filter-fallback-input" id="review-status" size="small" value={filters.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined }))} />
                  </div>
                  <div className="expert-filter-field">
                    <label htmlFor="review-prescription-type">处方类型</label>
                    <Select
                      aria-label="处方类型选择"
                      size="small"
                      allowClear
                      placeholder="全部类型"
                      value={filters.prescription_type}
                      options={["training", "referral", "adjustment"].map((value) => ({ value, label: prescriptionTypeLabel(value) }))}
                      onChange={(value) => setFilters((current) => ({ ...current, prescription_type: value }))}
                    />
                    <Input className="filter-fallback-input" id="review-prescription-type" size="small" value={filters.prescription_type ?? ""} onChange={(event) => setFilters((current) => ({ ...current, prescription_type: event.target.value || undefined }))} />
                  </div>
                  </div>
                </div>
                <div className="expert-filter-row expert-filter-secondary-row" data-testid="expert-filter-secondary-row">
                  <div className="expert-filter-field expert-filter-range" data-testid="review-date-range">
                    <span className="filter-label">日期范围</span>
                    <DatePicker.RangePicker
                      size="small"
                      inputReadOnly
                      aria-label="审核日期范围"
                      onChange={(_, dateStrings) => setFilters((current) => ({
                        ...current,
                        start_date: dateStrings[0] || undefined,
                        end_date: dateStrings[1] || undefined
                      }))}
                    />
                    <label htmlFor="review-start-date">开始日期</label>
                    <Input className="filter-fallback-input" id="review-start-date" size="small" type="date" value={filters.start_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value || undefined }))} />
                    <label htmlFor="review-end-date">结束日期</label>
                    <Input className="filter-fallback-input" id="review-end-date" size="small" type="date" value={filters.end_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value || undefined }))} />
                  </div>
                  <div className="expert-filter-field expert-filter-org">
                    <label htmlFor="review-organization">机构</label>
                    <Input id="review-organization" size="small" type="number" value={filters.organization_id ?? ""} onChange={(event) => setFilters((current) => ({ ...current, organization_id: event.target.value ? Number(event.target.value) : undefined }))} />
                  </div>
                  <span className="expert-switch-line">
                    <Switch aria-label="仅异常反馈" size="small" checked={Boolean(filters.abnormal_feedback)} onChange={(checked) => setFilters((current) => ({ ...current, abnormal_feedback: checked || undefined }))} />
                    <Typography.Text>异常反馈</Typography.Text>
                  </span>
                  <Button aria-label="筛选" size="small" type="primary" onClick={applyFilters}>筛选</Button>
                </div>
              </div>
              </details>
              {queueError ? (
                <Alert type="error" showIcon message="审核队列加载失败，请确认专家权限或稍后重试。" />
              ) : items.length ? (
                <List
                  dataSource={items}
                  renderItem={(item) => (
                    <List.Item
                      data-testid="expert-task-card"
                      onClick={() => setSelected(item)}
                      className={`review-list-item expert-task-card${selected?.prescription_id === item.prescription_id ? " is-selected" : ""}`}
                      style={{ borderLeft: `4px solid ${priorityMeta(item).border}` }}
                    >
                      <div className="task-card-top">
                        <span className="task-card-title">
                          <Stethoscope size={16} />
                          <Typography.Text strong>处方 #{item.prescription_id}</Typography.Text>
                        </span>
                        <Tag>{statusLabel(item.status)}</Tag>
                      </div>
                      <div className="task-card-meta">
                        <Tag color={item.risk_level === "R2" ? "orange" : "red"}>{item.risk_level}</Tag>
                        <Tag>{prescriptionTypeLabel(item.prescription_type)}</Tag>
                        <Tag color={priorityMeta(item).color}>{`优先级 ${priorityMeta(item).label}`}</Tag>
                      </div>
                      <div className="task-card-bottom">
                        <span><AlertTriangle size={14} />{`异常反馈 ${item.abnormal_feedback_count}`}</span>
                        <span><FileText size={14} />{`v${item.version}`}</span>
                        <span>{waitDuration(item.created_at)}</span>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无待审核处方" />
              )}
            </Card>
            <Card title="用户画像" className="expert-panel">
              {detail ? (
                <div className="expert-profile-summary">
                  <div className="profile-chip-row">
                    <Tag>{`用户 #${selected?.user_id}`}</Tag>
                    <Tag color={selected?.risk_level === "R3" ? "red" : "orange"}>{selected?.risk_level}</Tag>
                    <Tag>{selected ? statusLabel(selected.status) : "-"}</Tag>
                  </div>
                  <Typography.Text>{`姓名：${String(detail.health_snapshot.profile?.name ?? "-")}`}</Typography.Text>
                  <div className="expert-profile-vitals">
                    <span>{`血压：${String(detail.health_snapshot.fitness_test?.sbp ?? "-")}/${String(detail.health_snapshot.fitness_test?.dbp ?? "-")} mmHg`}</span>
                    <span>{`疼痛评分：${String(detail.health_snapshot.fitness_test?.pain_score ?? "-")}`}</span>
                  </div>
                  <Typography.Text strong>六类数据</Typography.Text>
                  <div className="expert-profile-metric-grid">
                    {sixDataLines(detail).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                  <Typography.Text strong>趋势</Typography.Text>
                  <Typography.Text>{trendLine(detail)}</Typography.Text>
                </div>
              ) : (
                <Typography.Paragraph>
                  {detailError ? detailErrorMessage : "选择审核任务后查看用户六类数据摘要。"}
                </Typography.Paragraph>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={11} className="expert-middle-column" data-testid="expert-middle-column">
            <Card title="处方编辑" className="expert-panel">
              {isR3Review ? (
                <Alert
                  className="form-alert"
                  type="error"
                  showIcon
                  message="R3 不允许发布训练处方，仅可建议医学评估 / 转介。"
                />
              ) : null}
              <PrescriptionEditor>
                <div className="expert-editor-heading">
                  <div>
                    <Typography.Text strong>AI 初稿 / 专家修改</Typography.Text>
                    <Typography.Text type="secondary">结构化字段会写入处方版本和审计记录</Typography.Text>
                  </div>
                  <Space wrap size={[6, 6]}>
                    <Tag color="blue">结构化编辑</Tag>
                    <Button size="small" aria-label="开始审核" disabled={!selected} onClick={startReview}>
                      开始审核
                    </Button>
                  </Space>
                </div>
                <div className="expert-fitt-grid" data-testid="expert-fitt-grid">
                  {fittEditorFields.map((item) => (
                    <div className="expert-fitt-block" key={item.key}>
                      <div className="expert-fitt-block-title">
                        <span className="fitt-letter">{item.letter}</span>
                        <label htmlFor={`expert-${item.key}`}>{item.label}</label>
                        {displayValue(aiDraftFitt[item.key], "") ? <Tag>{`推荐 ${displayValue(aiDraftFitt[item.key], "")}`}</Tag> : null}
                      </div>
                      <Input id={`expert-${item.key}`} value={editor[item.key]} placeholder={item.placeholder} suffix={item.suffix} onChange={(event) => updateEditor(item.key, event.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="expert-tag-editors">
                  <div className="expert-tag-editor">
                    <div className="expert-tag-editor-head">
                      <label htmlFor="expert-precautions">注意事项</label>
                      <Tag color="blue">可编辑 Tag</Tag>
                    </div>
                    <div className="editable-tag-row">
                      {splitList(editor.precautions).map((item) => <Tag key={item}>{item}</Tag>)}
                      {!splitList(editor.precautions).length ? <Typography.Text type="secondary">暂无注意事项</Typography.Text> : null}
                    </div>
                    <Input.TextArea id="expert-precautions" rows={2} value={editor.precautions} onChange={(event) => updateEditor("precautions", event.target.value)} />
                  </div>
                  <div className="expert-tag-editor">
                    <div className="expert-tag-editor-head">
                      <label htmlFor="expert-contraindications">禁忌</label>
                      <Tag color="red">安全边界</Tag>
                    </div>
                    <div className="editable-tag-row">
                      {splitList(editor.contraindications).map((item) => <Tag color="red" key={item}>{item}</Tag>)}
                      {!splitList(editor.contraindications).length ? <Typography.Text type="secondary">暂无禁忌动作</Typography.Text> : null}
                    </div>
                    <Input.TextArea id="expert-contraindications" rows={2} value={editor.contraindications} onChange={(event) => updateEditor("contraindications", event.target.value)} />
                  </div>
                  <div className="expert-tag-editor">
                    <div className="expert-tag-editor-head">
                      <label htmlFor="expert-reassessment">复评</label>
                      <Tag>周期</Tag>
                    </div>
                    <Input id="expert-reassessment" value={editor.reassessment} onChange={(event) => updateEditor("reassessment", event.target.value)} />
                  </div>
                  <div className="expert-tag-editor">
                    <div className="expert-tag-editor-head">
                      <label htmlFor="expert-safety-notice">安全提示</label>
                      <Tag color="orange">发布前确认</Tag>
                    </div>
                    <Input.TextArea id="expert-safety-notice" rows={2} value={editor.safety_notice} onChange={(event) => updateEditor("safety_notice", event.target.value)} />
                  </div>
                </div>
              </PrescriptionEditor>
              <Row gutter={[12, 12]} style={{ marginTop: 16, marginBottom: 16 }}>
                <Col xs={24} md={12}>
                  <Card size="small" title="AI 初稿">
                    <Space direction="vertical" size={4}>
                      {fittLines(displayedDraftFitt).map((line) => (
                        <Typography.Text key={line}>{line}</Typography.Text>
                      ))}
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="结构化差异">
                    <Space direction="vertical" size={4}>
                      {structuredDiffLines(detail).map((line) => (
                        <Typography.Text key={line}>{line}</Typography.Text>
                      ))}
                    </Space>
                  </Card>
                </Col>
              </Row>
              <div className="expert-action-bar" data-testid="expert-action-bar">
                <div className="expert-action-buttons">
                  <Button aria-label="保存草稿" disabled={!selected} onClick={() => setNotice("草稿已保留在当前审核会话，发布前不会下发用户端。")}>
                    保存草稿
                  </Button>
                  <Button aria-label="驳回重生成" disabled={!selected} onClick={() => handleAction("reject")}>
                    驳回重生成
                  </Button>
                  <Button aria-label="补充资料" disabled={!selected} onClick={() => handleAction("requestInfo")}>
                    补充资料
                  </Button>
                  <Button danger aria-label="转介" disabled={!selected} onClick={() => handleAction("refer")}>
                    转介
                  </Button>
                  <Button type="primary" aria-label="批准发布" disabled={!canPublishReview} onClick={requestApprove}>
                    批准发布
                  </Button>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={7} className="expert-right-column" data-testid="expert-right-column">
            <Card title="规则证据" className="expert-panel evidence-side-panel">
              <div className="evidence-side-stats" aria-label="规则与证据摘要">
                <div className="evidence-side-stat">
                  <span>规则数</span>
                  <strong>{detail?.risk_rules?.length ?? 0}</strong>
                </div>
                <div className="evidence-side-stat">
                  <span>禁忌数</span>
                  <strong>{detail?.prescription.contraindications?.length ?? 0}</strong>
                </div>
                <div className="evidence-side-stat">
                  <span>证据数</span>
                  <strong>{detail?.evidence_refs?.length ?? 0}</strong>
                </div>
              </div>
              <Tabs
                aria-label="规则与证据侧栏"
                defaultActiveKey={new URLSearchParams(location.search).get("panel") === "evidence" ? "evidence" : "rules"}
                items={[
                  {
                    key: "rules",
                    label: "规则",
                    forceRender: true,
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <Typography.Text strong>命中规则</Typography.Text>
                        <EvidenceTimeline
                          items={[
                            {
                              title: "规则命中",
                              description: (detail?.risk_rules ?? []).length
                                ? (detail?.risk_rules ?? []).map((rule) => String(rule.code ?? rule.message ?? "规则")).join("；")
                                : "暂无规则命中",
                              status: "done"
                            },
                            {
                              title: "RAG 证据",
                              description: (detail?.evidence_refs ?? []).length
                                ? (detail?.evidence_refs ?? []).map((item) => String(item.document_title ?? item.source ?? "证据")).join("；")
                                : "暂无 RAG 证据",
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
                          (detail?.risk_rules ?? []).map((rule) => (
                            <RuleHitCard key={`rule-${String(rule.code ?? rule.message)}`} rule={rule} />
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
                    forceRender: true,
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <Typography.Text strong>RAG 来源</Typography.Text>
                        {(detail?.evidence_refs ?? []).length ? (
                          (detail?.evidence_refs ?? []).map((item) => (
                            <div key={`evidence-${String(item.chunk_id ?? item.document_title ?? item.source)}`} className="rag-evidence-item">
                              <EvidenceCard evidence={item} />
                              <Space wrap size={6}>
                                {item.section ? <Tag>{String(item.section)}</Tag> : null}
                                {item.chunk_id ? <Tag>{`片段 #${String(item.chunk_id)}`}</Tag> : null}
                                {item.source ? <Tag>{String(item.source)}</Tag> : null}
                              </Space>
                              {item.quote ? <Typography.Text type="secondary">{String(item.quote)}</Typography.Text> : null}
                            </div>
                          ))
                        ) : (
                          <Typography.Text type="secondary">暂无 RAG 证据</Typography.Text>
                        )}
                        <Typography.Text strong>禁忌动作</Typography.Text>
                        {(detail?.prescription.contraindications ?? []).length ? (
                          (detail?.prescription.contraindications ?? []).map((item) => (
                            <Tag color="red" key={item}>{item}</Tag>
                          ))
                        ) : (
                          <Typography.Text type="secondary">暂无禁忌动作</Typography.Text>
                        )}
                      </Space>
                    )
                  },
                  {
                    key: "versions",
                    label: "版本",
                    forceRender: true,
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <Typography.Text strong>模板与动作</Typography.Text>
                        <Typography.Text>{String(detail?.template?.name ?? "-")}</Typography.Text>
                        {(detail?.candidate_actions ?? []).map((action, index) => (
                          <Typography.Text key={`action-${String(action.id ?? action.name ?? index)}-${index}`}>{String(action.name)}：禁忌 {String((action.contraindication_tags as string[] | undefined)?.join("、") ?? "-")}</Typography.Text>
                        ))}
                        <Typography.Text strong>历史版本</Typography.Text>
                        {versionLines(detail, selected).length ? (
                          versionLines(detail, selected).map((line) => <Typography.Text key={line}>{line}</Typography.Text>)
                        ) : (
                          <Typography.Text type="secondary">暂无版本记录</Typography.Text>
                        )}
                      </Space>
                    )
                  },
                  {
                    key: "audit",
                    label: "审计",
                    forceRender: true,
                    children: (
                      <Space direction="vertical" size={8} className="onboarding-section">
                        <Typography.Text strong>审核意见</Typography.Text>
                        <label htmlFor="expert-review-comment">审核意见</label>
                        <Input.TextArea
                          id="expert-review-comment"
                          rows={4}
                          value={reviewComment}
                          onChange={(event) => setReviewComment(event.target.value)}
                          placeholder="填写审核意见、补充资料要求或转介建议"
                        />
                        <Typography.Text strong>审计留痕</Typography.Text>
                        <AuditTrail
                          items={[
                            detail?.review?.id ? `审核单 #${detail.review.id}` : "",
                            selected?.review_id ? `队列任务 #${selected.review_id}` : "",
                            selected ? `当前状态 ${selected.status}` : ""
                          ].filter(Boolean)}
                        />
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        </ReviewWorkbench>
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
