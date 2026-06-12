import { Alert, Button, Card, Checkbox, Col, Empty, Input, List, Modal, Row, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

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
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <MetricCard title="R2 待审" value={stats?.r2_pending_count ?? 0} />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard title="平均审核时长" value={stats?.average_review_hours ?? 0} suffix="小时" />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard title="超时项" value={stats?.timeout_count ?? 0} />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24}>
            <ChartCard title="专家审核队列分布">
              <ExpertQueueChart data={queueChartData(items)} />
            </ChartCard>
          </Col>
        </Row>
        <ReviewWorkbench>
          <Col xs={24} lg={6}>
            <Card title="审核队列" className="expert-panel">
              <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 12 }}>
                <label htmlFor="review-risk-level">风险等级</label>
                <Input id="review-risk-level" value={filters.risk_level ?? ""} onChange={(event) => setFilters((current) => ({ ...current, risk_level: event.target.value || undefined }))} />
                <label htmlFor="review-status">审核状态</label>
                <Input id="review-status" value={filters.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined }))} />
                <label htmlFor="review-organization">机构</label>
                <Input id="review-organization" type="number" value={filters.organization_id ?? ""} onChange={(event) => setFilters((current) => ({ ...current, organization_id: event.target.value ? Number(event.target.value) : undefined }))} />
                <label htmlFor="review-prescription-type">处方类型</label>
                <Input id="review-prescription-type" value={filters.prescription_type ?? ""} onChange={(event) => setFilters((current) => ({ ...current, prescription_type: event.target.value || undefined }))} />
                <label htmlFor="review-start-date">开始日期</label>
                <Input id="review-start-date" type="date" value={filters.start_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value || undefined }))} />
                <label htmlFor="review-end-date">结束日期</label>
                <Input id="review-end-date" type="date" value={filters.end_date ?? ""} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value || undefined }))} />
                <Checkbox aria-label="仅异常反馈" checked={Boolean(filters.abnormal_feedback)} onChange={(event) => setFilters((current) => ({ ...current, abnormal_feedback: event.target.checked || undefined }))}>
                  仅异常反馈
                </Checkbox>
                <Button aria-label="筛选" onClick={applyFilters}>筛选</Button>
              </Space>
              {queueError ? (
                <Alert type="error" showIcon message="审核队列加载失败，请确认专家权限或稍后重试。" />
              ) : items.length ? (
                <List
                  dataSource={items}
                  renderItem={(item) => (
                    <List.Item
                      onClick={() => setSelected(item)}
                      className="review-list-item"
                      style={{
                        borderLeft: `4px solid ${priorityMeta(item).border}`,
                        background: selected?.prescription_id === item.prescription_id ? "#f6ffed" : undefined,
                        paddingLeft: 12
                      }}
                    >
                      <Space direction="vertical" size={4}>
                        <Typography.Text strong>处方 #{item.prescription_id}</Typography.Text>
                        <Space>
                          <Tag color={item.risk_level === "R2" ? "orange" : "red"}>{item.risk_level}</Tag>
                          <Tag>{item.status}</Tag>
                          <Tag>{item.prescription_type}</Tag>
                          <Tag color={priorityMeta(item).color}>{`优先级 ${priorityMeta(item).label}`}</Tag>
                        </Space>
                        <Typography.Text type="secondary">{`异常反馈 ${item.abnormal_feedback_count}`}</Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无待审核处方" />
              )}
            </Card>
            <Card title="用户画像" className="expert-panel">
              {detail ? (
                <Space direction="vertical" size={6}>
                  <Typography.Text>{`用户 #${selected?.user_id}，风险等级 ${selected?.risk_level}`}</Typography.Text>
                  <Typography.Text>{`姓名：${String(detail.health_snapshot.profile?.name ?? "-")}`}</Typography.Text>
                  <Typography.Text>{`血压：${String(detail.health_snapshot.fitness_test?.sbp ?? "-")}/${String(detail.health_snapshot.fitness_test?.dbp ?? "-")} mmHg`}</Typography.Text>
                  <Typography.Text>{`疼痛评分：${String(detail.health_snapshot.fitness_test?.pain_score ?? "-")}`}</Typography.Text>
                  <Typography.Text strong>六类数据</Typography.Text>
                  {sixDataLines(detail).map((line) => (
                    <Typography.Text key={line}>{line}</Typography.Text>
                  ))}
                  <Typography.Text strong>趋势</Typography.Text>
                  <Typography.Text>{trendLine(detail)}</Typography.Text>
                  <Typography.Text strong>历史版本</Typography.Text>
                  {versionLines(detail, selected).map((line) => (
                    <Typography.Text key={line}>{line}</Typography.Text>
                  ))}
                </Space>
              ) : (
                <Typography.Paragraph>
                  {detailError ? detailErrorMessage : "选择审核任务后查看用户六类数据摘要。"}
                </Typography.Paragraph>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={11}>
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
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <label htmlFor="expert-frequency">频率</label>
                  <Input id="expert-frequency" value={editor.frequency} onChange={(event) => updateEditor("frequency", event.target.value)} />
                  <label htmlFor="expert-intensity">强度</label>
                  <Input id="expert-intensity" value={editor.intensity} onChange={(event) => updateEditor("intensity", event.target.value)} />
                  <label htmlFor="expert-time">时间</label>
                  <Input id="expert-time" value={editor.time} onChange={(event) => updateEditor("time", event.target.value)} />
                  <label htmlFor="expert-type">类型</label>
                  <Input id="expert-type" value={editor.type} onChange={(event) => updateEditor("type", event.target.value)} />
                  <label htmlFor="expert-volume">总量</label>
                  <Input id="expert-volume" value={editor.volume} onChange={(event) => updateEditor("volume", event.target.value)} />
                  <label htmlFor="expert-progression">进阶</label>
                  <Input id="expert-progression" value={editor.progression} onChange={(event) => updateEditor("progression", event.target.value)} />
                  <label htmlFor="expert-precautions">注意事项</label>
                  <Input.TextArea id="expert-precautions" rows={2} value={editor.precautions} onChange={(event) => updateEditor("precautions", event.target.value)} />
                  <label htmlFor="expert-contraindications">禁忌</label>
                  <Input.TextArea id="expert-contraindications" rows={2} value={editor.contraindications} onChange={(event) => updateEditor("contraindications", event.target.value)} />
                  <label htmlFor="expert-reassessment">复评</label>
                  <Input id="expert-reassessment" value={editor.reassessment} onChange={(event) => updateEditor("reassessment", event.target.value)} />
                  <label htmlFor="expert-safety-notice">安全提示</label>
                  <Input.TextArea id="expert-safety-notice" rows={2} value={editor.safety_notice} onChange={(event) => updateEditor("safety_notice", event.target.value)} />
                </Space>
              </PrescriptionEditor>
              <Row gutter={[12, 12]} style={{ marginTop: 16, marginBottom: 16 }}>
                <Col xs={24} md={12}>
                  <Card size="small" title="AI 初稿">
                    <Space direction="vertical" size={4}>
                      {fittLines((detail?.template?.fitt_vp as Record<string, unknown> | undefined) ?? detail?.prescription.fitt_vp).map((line) => (
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
              <Space wrap>
                <Button aria-label="开始审核" disabled={!selected} onClick={startReview}>
                  开始审核
                </Button>
                <Button type="primary" aria-label="批准" disabled={!canPublishReview} onClick={requestApprove}>
                  批准
                </Button>
                <Button type="primary" aria-label="修改后发布" disabled={!canPublishReview} onClick={requestApprove}>
                  修改后发布
                </Button>
                <Button aria-label="驳回" disabled={!selected} onClick={() => handleAction("reject")}>驳回</Button>
                <Button aria-label="驳回重生成" disabled={!selected} onClick={() => handleAction("reject")}>
                  驳回重生成
                </Button>
                <Button danger aria-label="转介" disabled={!selected} onClick={() => handleAction("refer")}>
                  转介
                </Button>
                <Button danger aria-label="建议医学评估/转介" disabled={!selected} onClick={() => handleAction("refer")}>
                  建议医学评估/转介
                </Button>
                <Button aria-label="要求补充资料" disabled={!selected} onClick={() => handleAction("requestInfo")}>
                  要求补充资料
                </Button>
                <Button danger aria-label="暂停运动" disabled={!selected} onClick={() => handleAction("pause")}>
                  暂停运动
                </Button>
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={7}>
            <Card title="规则证据" className="expert-panel">
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
                  (detail?.risk_rules ?? []).slice(0, 3).map((rule) => (
                    <RuleHitCard key={`rule-${String(rule.code)}`} rule={rule} />
                  ))
                ) : (
                  <Typography.Text type="secondary">暂无规则命中</Typography.Text>
                )}
                <Typography.Text strong>RAG 来源</Typography.Text>
                {(detail?.evidence_refs ?? []).length ? (
                  (detail?.evidence_refs ?? []).slice(0, 3).map((item) => (
                    <div key={`evidence-${String(item.chunk_id)}`}>
                      <EvidenceCard evidence={item} />
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
                <Typography.Text strong>模板与动作</Typography.Text>
                <Typography.Text>{String(detail?.template?.name ?? "-")}</Typography.Text>
                {(detail?.candidate_actions ?? []).slice(0, 3).map((action, index) => (
                  <Typography.Text key={`action-${String(action.id ?? action.name ?? index)}-${index}`}>{String(action.name)}：禁忌 {String((action.contraindication_tags as string[] | undefined)?.join("、") ?? "-")}</Typography.Text>
                ))}
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
