import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldAlert,
  User,
  XSquare
} from "lucide-react";

import {
  approvePrescription,
  getReviewDetail,
  getReviewStats,
  listReviewQueue,
  pausePrescription,
  referPrescription,
  rejectPrescription,
  requestMoreInformation,
  startReview,
  type ReviewDetail,
  type ReviewQueueFilters,
  type ReviewQueueItem,
  type ReviewStats
} from "../../api/expertReviews";
import { performLogout } from "../../auth/session";
import "./expert-portal.css";

type RiskMode = "R2" | "R3";
type QueueStatusFilter = "all" | "pending" | "mine";
type QueueRiskFilter = "all" | RiskMode;
type ActionNotice = {
  type: "success" | "error" | "warning" | "info";
  message: string;
  description?: string;
};

const fallbackStats: ReviewStats = {
  average_review_hours: 1.4,
  r2_pending_count: 12,
  timeout_count: 0
};

const fallbackQueue: ReviewQueueItem[] = [
  {
    prescription_id: 81,
    user_id: 2,
    organization_id: 6,
    risk_level: "R3",
    status: "PENDING_REVIEW",
    prescription_type: "referral",
    abnormal_feedback_count: 2,
    version: 1,
    created_at: "2026-06-02T00:00:00Z",
    review_id: 10
  },
  {
    prescription_id: 82,
    user_id: 5,
    organization_id: 7,
    risk_level: "R2",
    status: "IN_REVIEW",
    prescription_type: "training",
    abnormal_feedback_count: 0,
    version: 3,
    created_at: "2026-06-03T00:00:00Z",
    review_id: 12
  }
];

function Button({
  children,
  type = "default",
  danger = false,
  disabled = false,
  className = "",
  onClick
}: {
  children: ReactNode;
  type?: "default" | "primary" | "text" | "success";
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`ep-button ep-button-${type}${danger ? " is-danger" : ""} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Badge({
  tone = "default",
  text,
  pulse = false
}: {
  tone?: "default" | "info" | "warning" | "error" | "success" | "purple";
  text: string;
  pulse?: boolean;
}) {
  if (pulse) {
    return (
      <span className="ep-pulse-badge">
        <span />
        {text}
      </span>
    );
  }
  return <span className={`ep-badge ep-badge-${tone}`}>{text}</span>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ep-card ${className}`}>{children}</section>;
}

function Alert({
  type = "info",
  message,
  description,
  icon
}: {
  type?: "info" | "success" | "warning" | "error";
  message: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`ep-alert ep-alert-${type}`}>
      {icon ? <span className="ep-alert-icon">{icon}</span> : null}
      <div>
        <strong>{message}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

function asText(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" / ") || fallback;
  return String(value);
}

function fittValue(detail: ReviewDetail | null, key: string, fallback: string) {
  return asText(detail?.prescription.fitt_vp?.[key], fallback);
}

function statusText(status: string | null | undefined) {
  const labels: Record<string, string> = {
    PENDING: "待领取",
    PENDING_REVIEW: "待领取",
    IN_REVIEW: "审核中",
    NEEDS_INFO: "待补充",
    REFERRED: "已转介",
    APPROVED: "已批准",
    REJECTED: "已驳回",
    PAUSED: "已暂停"
  };
  return labels[String(status ?? "")] ?? String(status || "待领取");
}

function queueAlert(task: ReviewQueueItem | null | undefined) {
  if (!task) return null;
  if (task.risk_level === "R3") return "近期不明原因胸闷";
  if (task.abnormal_feedback_count > 0) return `异常反馈 ${task.abnormal_feedback_count}`;
  return null;
}

function displayPrescriptionId(task: ReviewQueueItem | null | undefined) {
  return task ? `处方 #${task.prescription_id}` : "处方 #--";
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    const detail = response?.data?.detail;
    if (detail) return asText(detail, "操作失败，请稍后重试。");
  }
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试或联系管理员。";
}

function buildQueueFilters(statusFilter: QueueStatusFilter, riskFilter: QueueRiskFilter, searchText: string): ReviewQueueFilters {
  const filters: ReviewQueueFilters = {};
  if (statusFilter === "pending") filters.status = "PENDING_REVIEW";
  if (statusFilter === "mine") filters.status = "IN_REVIEW";
  if (riskFilter !== "all") filters.risk_level = riskFilter;
  const search = searchText.trim();
  if (search) filters.search = search;
  return filters;
}

function ExpertShell({
  active,
  children
}: {
  active: "dashboard" | "history";
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const userName = localStorage.getItem("current_user_name") || "李主任医生";
  const [loggingOut, setLoggingOut] = useState(false);
  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "紧急分诊与队列", path: "/expert/dashboard" },
    { id: "history", icon: CheckSquare, label: "已审核记录", path: "/expert/reviews" }
  ] as const;

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await performLogout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="expert-portal-shell">
      <aside className="expert-sidebar">
        <Link to="/" className="expert-brand">
          <span className="expert-brand-mark">
            <Activity />
          </span>
          <span>启衡临床中台</span>
        </Link>
        <nav className="expert-nav" aria-label="专家工作台导航">
          <div className="expert-nav-title">专家工作台 (EXPERT)</div>
          {navItems.map((item) => (
            <Link key={item.id} to={item.path} className={`expert-nav-item${active === item.id ? " is-active" : ""}`}>
              <item.icon />
              {item.label}
            </Link>
          ))}
        </nav>
        <footer className="expert-account">
          <span className="expert-avatar">专</span>
          <div>
            <strong>{userName}</strong>
            <small>内分泌与代谢科</small>
          </div>
          <button type="button" className="expert-logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut />
            <span>{loggingOut ? "退出中" : "退出登录"}</span>
          </button>
        </footer>
      </aside>
      <main className="expert-main">
        <div className="expert-grid-bg" aria-hidden="true" />
        <header className="expert-topbar">
          <h1>{active === "dashboard" ? "紧急分诊与队列" : "已审核记录"}</h1>
          <span>当前辖区：北京示范基地第一卫生站</span>
        </header>
        <div className="expert-scroll">{children}</div>
      </main>
    </div>
  );
}

function TriageDashboard() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<ReviewQueueItem[]>(fallbackQueue);
  const [stats, setStats] = useState<ReviewStats>(fallbackStats);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [riskFilter, setRiskFilter] = useState<QueueRiskFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [queueNotice, setQueueNotice] = useState<ActionNotice | null>(null);

  useEffect(() => {
    let mounted = true;

    getReviewStats()
      .then((statsData) => {
        if (!mounted) return;
        setStats(statsData);
      })
      .catch(() => {
        if (!mounted) return;
        setStats(fallbackStats);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const filters = buildQueueFilters(statusFilter, riskFilter, searchText);

    listReviewQueue(filters)
      .then((queueData) => {
        if (!mounted) return;
        setQueue(queueData);
        setQueueNotice(null);
      })
      .catch(() => {
        if (!mounted) return;
        setQueue(fallbackQueue);
        setQueueNotice({
          type: "warning",
          message: "队列读取失败",
          description: "当前显示本地兜底数据，请稍后刷新重试。"
        });
      });

    return () => {
      mounted = false;
    };
  }, [riskFilter, searchText, statusFilter]);

  async function openTask(task: ReviewQueueItem) {
    if (task.status === "IN_REVIEW") {
      navigate(`/expert/reviews/${task.prescription_id}`);
      return;
    }
    setClaimingId(task.prescription_id);
    setQueueNotice(null);
    try {
      await startReview(task.prescription_id);
      setQueue((current) =>
        current.map((item) =>
          item.prescription_id === task.prescription_id ? { ...item, status: "IN_REVIEW" } : item
        )
      );
      navigate(`/expert/reviews/${task.prescription_id}`);
    } catch (error) {
      setQueueNotice({
        type: "error",
        message: "领取审核失败",
        description: errorMessage(error)
      });
    } finally {
      setClaimingId(null);
    }
  }

  const visibleQueue = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return queue;
    return queue.filter((task) =>
      String(task.prescription_id).includes(term) ||
      String(task.user_id).includes(term) ||
      displayPrescriptionId(task).toLowerCase().includes(term)
    );
  }, [queue, searchText]);

  const r3Count = visibleQueue.filter((task) => task.risk_level === "R3" || task.abnormal_feedback_count > 0).length;
  const highPriority = visibleQueue[0] ?? null;

  return (
    <ExpertShell active="dashboard">
      <section className="expert-triage ep-fade-in">
        <div className="expert-kpi-grid">
          <Card className="expert-kpi-card">
            <span>平均审核耗时</span>
            <strong>{`${stats.average_review_hours ?? 1.4} 小时`}</strong>
          </Card>
          <Card className="expert-kpi-card">
            <span>R2 待审核</span>
            <strong className="is-warning">{`${stats.r2_pending_count ?? 0} 份`}</strong>
          </Card>
          <Card className="expert-kpi-card">
            <span>超时待办 (&gt;24h)</span>
            <strong>{`${stats.timeout_count ?? 0} 份`}</strong>
          </Card>
          <div className="expert-kpi-danger">
            <AlertOctagon />
            <span>R3 / 红色异常反馈</span>
            <strong>{`${r3Count} 份`}</strong>
          </div>
        </div>

        <div className="expert-filter-bar">
          <div className="expert-segment" aria-label="队列筛选">
            <button type="button" className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")}>全部待办</button>
            <button type="button" className={statusFilter === "pending" ? "is-active" : ""} onClick={() => setStatusFilter("pending")}>待领取</button>
            <button type="button" className={statusFilter === "mine" ? "is-active" : ""} onClick={() => setStatusFilter("mine")}>我的审核中</button>
          </div>
          <div className="expert-filter-actions">
            <label className="expert-risk-select">
              <Filter />
              <select aria-label="风险等级" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as QueueRiskFilter)}>
                <option value="all">风险等级：全部</option>
                <option value="R2">风险等级：R2</option>
                <option value="R3">风险等级：R3</option>
              </select>
              <ChevronDown />
            </label>
            <label>
              <Search />
              <input
                type="text"
                placeholder="搜索患者或处方编号"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>
          </div>
        </div>

        {queueNotice ? (
          <Alert type={queueNotice.type} message={queueNotice.message} description={queueNotice.description} />
        ) : null}

        <Card className="expert-table-card">
          <table aria-label="专家分诊任务列表" className="expert-task-table">
            <thead>
              <tr>
                <th>处方编号</th>
                <th>患者信息</th>
                <th>风险评级</th>
                <th>异常反馈预警</th>
                <th>当前状态</th>
                <th>等待时长</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleQueue.map((task, index) => {
                const alertText = queueAlert(task);
                return (
                  <tr key={`${task.prescription_id}-${task.review_id ?? index}`}>
                    <td>
                      <button type="button" className="expert-id-link" onClick={() => navigate(`/expert/reviews/${task.prescription_id}`)}>
                        {displayPrescriptionId(task)}
                      </button>
                    </td>
                    <td>{`用户 #${task.user_id}`}</td>
                    <td>
                      <Badge
                        tone={task.risk_level === "R3" ? "error" : "warning"}
                        text={task.risk_level === "R3" ? "R3 红色高危" : "R2 中风险"}
                      />
                    </td>
                    <td>{alertText ? <Badge pulse text={alertText} /> : <span className="expert-muted">-</span>}</td>
                    <td><Badge tone={task.status === "IN_REVIEW" ? "purple" : "info"} text={statusText(task.status)} /></td>
                    <td>{index === 0 ? "15分钟" : `${index + 1}小时`}</td>
                    <td>
                      <Button type="primary" disabled={claimingId === task.prescription_id} onClick={() => openTask(task)}>
                        {claimingId === task.prescription_id ? "领取中" : task.status === "IN_REVIEW" ? "继续审核" : "领取并审核"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!visibleQueue.length ? (
                <tr>
                  <td colSpan={7}>
                    <div className="expert-empty-row">当前筛选条件下没有待处理审核任务。</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <section className="expert-priority-strip">
          <div>
            <strong>最高优先级</strong>
            <span>{displayPrescriptionId(highPriority)} · {queueAlert(highPriority) ?? "等待专家分诊"}</span>
          </div>
          <Button type="primary" disabled={!highPriority} onClick={() => highPriority ? openTask(highPriority) : undefined}>
            打开单任务审核
          </Button>
        </section>
      </section>
    </ExpertShell>
  );
}

function SafetyConfirmationDialog({
  open,
  checked,
  onCheck,
  onClose,
  onConfirm
}: {
  open: boolean;
  checked: boolean;
  onCheck: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ep-modal-layer">
      <div className="ep-modal" role="dialog" aria-modal="true" aria-label="安全二次确认">
        <header>
          <h2>
            <ShieldAlert />
            安全二次确认
          </h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <XSquare />
          </button>
        </header>
        <div className="ep-modal-body">
          <p>
            您即将把该处方状态变更为 PUBLISHED (已发布)。发布后，用户将在客户端直接看到该训练计划并可以开始运动打卡。
          </p>
          <label className="ep-confirm-check">
            <input type="checkbox" checked={checked} onChange={(event) => onCheck(event.target.checked)} />
            我已亲自核对用户的医疗风险、禁忌动作与处方运动强度
          </label>
        </div>
        <footer>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!checked} onClick={onConfirm}>确认发布</Button>
        </footer>
      </div>
    </div>
  );
}

function SingleReviewWorkspace({ prescriptionId }: { prescriptionId: number }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState("每周 3-5 次");
  const [time, setTime] = useState("每次 30-45 分钟");
  const [reassessment, setReassessment] = useState("前两周密切关注运动后血压变化，无异常则 4 周后进行线上阶段小结。");
  const [referralAdvice, setReferralAdvice] = useState(
    "用户近期存在不明原因胸闷，且血压处于较高水平，属于运动高危红旗症状。不建议目前进行任何规律性锻炼，请前往医院心血管内科进一步评估。"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const editedFieldsRef = useRef({ frequency: false, time: false, reassessment: false });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    editedFieldsRef.current = { frequency: false, time: false, reassessment: false };
    getReviewDetail(prescriptionId)
      .then((data) => {
        if (!mounted) return;
        setDetail(data);
        if (!editedFieldsRef.current.frequency) {
          setFrequency(fittValue(data, "frequency", "每周 3-5 次"));
        }
        if (!editedFieldsRef.current.time) {
          setTime(fittValue(data, "time", "每次 30-45 分钟"));
        }
        if (!editedFieldsRef.current.reassessment) {
          setReassessment(asText(data.prescription.reassessment, "前两周密切关注运动后血压变化，无异常则 4 周后进行线上阶段小结。"));
        }
      })
      .catch(() => {
        if (!mounted) return;
        setDetail(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [prescriptionId]);

  const riskMode = useMemo<RiskMode>(() => {
    const level = detail?.prescription.risk_level;
    return level === "R3" ? "R3" : "R2";
  }, [detail]);
  const profile = detail?.health_snapshot.profile ?? {};
  const fitness = detail?.health_snapshot.fitness_test ?? {};
  const body = detail?.health_snapshot.body_composition ?? {};
  const templateName = asText(detail?.template?.name, "高血压稳定期改善模板");

  async function confirmPublish() {
    setActing("approve");
    setActionNotice(null);
    try {
      await approvePrescription(prescriptionId, {
        review_comment: "我已亲自核对用户的医疗风险、禁忌动作与处方运动强度，确认该处方可安全执行。",
        edited_prescription: {
          fitt_vp: {
            frequency,
            intensity: "中低强度 (RPE 4-6)",
            time,
            type: ["快走", "功率自行车"],
            volume: "每周累计约 120 分钟",
            progression: "每 2-4 周按反馈调整"
          },
          precautions: ["运动前后监测血压", "出现头晕胸闷立即停止"],
          contraindications: ["避免长时间憋气动作", "避免大重量深蹲"],
          reassessment,
          safety_notice: "专家已锁定中低强度上限。"
        },
      });
      setDialogOpen(false);
      setActionNotice({ type: "success", message: "处方已批准发布", description: "用户端将按专家锁定后的安全边界展示训练计划。" });
    } catch (error) {
      setActionNotice({ type: "error", message: "批准发布失败", description: errorMessage(error) });
    } finally {
      setActing(null);
    }
  }

  async function sendReferral() {
    await runReviewAction("refer", "已发送转介通知", () =>
      referPrescription(prescriptionId, {
        review_comment: referralAdvice,
        edited_prescription: {
          contraindications: ["不发布训练处方"],
          safety_notice: "当前仅建议医学评估或转介。"
        }
      })
    );
  }

  async function runReviewAction(key: string, successMessage: string, action: () => Promise<unknown>) {
    setActing(key);
    setActionNotice(null);
    try {
      await action();
      setActionNotice({ type: "success", message: successMessage });
    } catch (error) {
      setActionNotice({ type: "error", message: "审核动作提交失败", description: errorMessage(error) });
    } finally {
      setActing(null);
    }
  }

  async function requestHospitalDiagnosis() {
    await runReviewAction("request-hospital", "已发送补充资料要求", () =>
      requestMoreInformation(prescriptionId, {
        review_comment: "要求补充院内诊断资料：请上传近期门诊诊断、心血管评估或医嘱结论，专家复核前保持运动阻断。"
      })
    );
  }

  async function requestFitnessData() {
    await runReviewAction("request-fitness", "已发送补充资料要求", () =>
      requestMoreInformation(prescriptionId, {
        review_comment: "要求补充体测数据：请补充静息血压、心率、疼痛评分和基础体适能记录后再生成最终处方。"
      })
    );
  }

  async function rejectDraft() {
    await runReviewAction("reject", "已驳回初稿并要求重生成", () =>
      rejectPrescription(prescriptionId, {
        review_comment: "驳回初稿重生成：当前处方初稿与风险分级或禁忌边界不匹配，请系统基于专家意见重新生成。"
      })
    );
  }

  async function pauseCurrentPrescription() {
    await runReviewAction("pause", "已暂停处方执行", () =>
      pausePrescription(prescriptionId, {
        review_comment: "暂停处方执行：发现安全风险或资料缺口，用户端应停止执行，等待补充资料和专家复核。"
      })
    );
  }

  async function escalateToReferral() {
    await runReviewAction("escalate-r3", "已判定为 R3 并转介", () =>
      referPrescription(prescriptionId, {
        review_comment: "专家复核后判定为 R3：当前风险状态不适合发布训练处方，转入院内评估或人工分诊。"
      })
    );
  }

  return (
    <div className="expert-review-fullscreen">
      <header className="expert-review-header">
        <div>
          <Button type="text" onClick={() => navigate("/expert/dashboard")}>
            <ArrowLeft />
          </Button>
          <span className="expert-header-divider" />
          <User />
          <h1>单任务审核工作台</h1>
          <strong>{`患者：${asText(profile.name, "张建国")} | ${asText(profile.sex, "男")} | ${asText(profile.age, "62")}岁`}</strong>
          <Badge tone="default" text="档案完整度: 92%" />
        </div>
        <div>
          <Badge tone={riskMode === "R3" ? "error" : "warning"} text={riskMode === "R3" ? "R3 高风险转介型" : "R2 中风险干预型"} />
          <span><Clock /> 等待: 2小时</span>
        </div>
      </header>

      <main className="expert-review-body" aria-busy={loading}>
        <aside className="expert-review-left">
          <PanelTitle icon={<Activity />} text="用户安全摘要" />
          <div className="expert-panel-scroll">
            <SectionLabel text="基础与体成分" />
            <InfoTable
              rows={[
                ["BMI", asText(body.bmi, "26.4 (超重)")],
                ["体脂率", `${asText(body.body_fat_pct, "28")}%`],
                ["运动习惯", "极少运动 (久坐)"]
              ]}
            />
            <SectionLabel text="体质与生命体征" badge="2 异常" />
            <InfoTable
              rows={[
                ["静息收缩压", asText(fitness.sbp, riskMode === "R3" ? "182" : "145"), "danger"],
                ["静息舒张压", asText(fitness.dbp, "88")],
                ["疼痛评分", `${asText(fitness.pain_score, "2")}分 (轻微膝痛)`],
                ...(riskMode === "R3" ? [["近期红旗", "不明原因胸闷", "danger"] as const] : [])
              ]}
            />
            <SectionLabel text="疾病筛查" />
            <div className="expert-tag-row">
              <span>高血压病史</span>
              <span>高脂血症</span>
            </div>
          </div>
        </aside>

        <section className="expert-review-editor">
          <header>
            <span>
              <FileText />
              系统初稿核对与编辑
            </span>
            <Badge tone="info" text="匹配模板" />
            <strong className="expert-template-name">{templateName}</strong>
          </header>
          <div className="expert-editor-scroll">
            {actionNotice ? (
              <Alert type={actionNotice.type} message={actionNotice.message} description={actionNotice.description} />
            ) : null}
            {riskMode === "R3" ? (
              <div className="expert-r3-block">
                <div className="expert-r3-head">
                  <span><AlertOctagon /></span>
                  <h2>R3 高风险转介型</h2>
                  <p>系统已安全阻断，该用户禁止生成训练处方。</p>
                </div>
                <label className="expert-field">
                  医学评估与转介建议 (必填)
                  <textarea value={referralAdvice} onChange={(event) => setReferralAdvice(event.target.value)} />
                </label>
              </div>
            ) : (
              <div className="expert-r2-editor">
                <Alert
                  type="info"
                  message="系统生成变更提示"
                  description="系统已根据高血压边界风险，自动将最高强度上限锁定为中低强度，并自动排除了大重量抗阻动作。"
                />
                <div className="expert-form-card">
                  <div className="expert-form-grid">
                    <label className="expert-field">
                      频率 (Frequency)
                      <input
                        value={frequency}
                        onChange={(event) => {
                          editedFieldsRef.current.frequency = true;
                          setFrequency(event.target.value);
                        }}
                      />
                    </label>
                    <label className="expert-field">
                      单次时间 (Time)
                      <input
                        value={time}
                        onChange={(event) => {
                          editedFieldsRef.current.time = true;
                          setTime(event.target.value);
                        }}
                      />
                    </label>
                  </div>
                  <div className="expert-field">
                    <span>强度 (Intensity)</span>
                    <div className="expert-intensity-lock">
                      <span className="is-selected">中低强度 (RPE 4-6)</span>
                      <span>中等强度 (被锁定)</span>
                      <span>高强度 (被锁定)</span>
                    </div>
                  </div>
                  <div className="expert-field">
                    <span>运动类型 (Type)</span>
                    <div className="expert-action-list">
                      <ActionItem index={1} title="热身：关节活动操" detail="5-10 分钟" />
                      <ActionItem index={2} title="主训练：快走 / 功率自行车" detail="20-30 分钟，保持可完整说话状态" />
                    </div>
                  </div>
                  <div className="expert-field">
                    <span>禁忌动作 (Contraindications)</span>
                    <div className="expert-contra-tags">
                      <span>避免长时间憋气动作 <XSquare /></span>
                      <span>避免大重量深蹲 <XSquare /></span>
                    </div>
                  </div>
                  <label className="expert-field">
                    复测周期安排
                    <textarea
                      value={reassessment}
                      onChange={(event) => {
                        editedFieldsRef.current.reassessment = true;
                        setReassessment(event.target.value);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="expert-review-right">
          <PanelTitle icon={<BookOpen />} text="规则与证据核对" />
          <div className="expert-panel-scroll">
            <EvidenceBlock
              title="命中风险规则 (1)"
              code={riskMode === "R3" ? "R3_RED_FLAG" : "YELLOW_HYPERTENSION"}
              description={riskMode === "R3" ? "近期胸闷或高危红旗，系统禁止发布训练处方。" : "收缩压 >= 140 或高血压病史 = 是，强度上限锁定为低-中等强度。"}
            />
            <EvidenceBlock
              title="RAG 知识证据溯源 (2)"
              code="高血压运动干预指南 2020版"
              description="对于收缩压处于 140-159 mmHg 的患者，优先推荐中低强度有氧运动，避免憋气动作以防血压骤升。"
            />
          </div>
        </aside>
      </main>

      <footer className="expert-review-footer">
        <div>
          {riskMode === "R3" ? (
            <Button disabled={acting === "request-hospital"} onClick={requestHospitalDiagnosis}>
              {acting === "request-hospital" ? "发送中" : "要求补充院内诊断资料"}
            </Button>
          ) : (
            <>
              <Button danger disabled={acting === "escalate-r3"} onClick={escalateToReferral}>
                {acting === "escalate-r3" ? "转介中" : "判定为 R3 并转介"}
              </Button>
              <Button disabled={acting === "request-fitness"} onClick={requestFitnessData}>
                {acting === "request-fitness" ? "发送中" : "要求补充体测数据"}
              </Button>
            </>
          )}
          <Button danger disabled={acting === "pause"} onClick={pauseCurrentPrescription}>
            {acting === "pause" ? "暂停中" : "暂停处方执行"}
          </Button>
        </div>
        <div>
          <Button danger disabled={acting === "reject"} onClick={rejectDraft}>
            {acting === "reject" ? "驳回中" : "驳回初稿重生成"}
          </Button>
          {riskMode === "R3" ? (
            <Button type="primary" danger disabled={acting === "refer"} onClick={sendReferral}>
              {acting === "refer" ? "发送中" : "核对并发送转介通知"}
            </Button>
          ) : (
            <Button type="success" disabled={acting === "approve"} onClick={() => {
              setConfirmed(false);
              setDialogOpen(true);
            }}>
              {acting === "approve" ? "发布中" : "核对并批准发布"}
            </Button>
          )}
        </div>
      </footer>

      <SafetyConfirmationDialog
        open={dialogOpen}
        checked={confirmed}
        onCheck={setConfirmed}
        onClose={() => setDialogOpen(false)}
        onConfirm={confirmPublish}
      />
    </div>
  );
}

function PanelTitle({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <header className="expert-panel-title">
      {icon}
      {text}
    </header>
  );
}

function SectionLabel({ text, badge }: { text: string; badge?: string }) {
  return (
    <div className="expert-section-label">
      {text}
      {badge ? <Badge tone="error" text={badge} /> : null}
    </div>
  );
}

function InfoTable({ rows }: { rows: Array<readonly [string, string, string?]> }) {
  return (
    <table className="expert-info-table">
      <tbody>
        {rows.map(([label, value, tone]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className={tone === "danger" ? "is-danger" : ""}>
              {value}
              {tone === "danger" ? <ArrowUp /> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActionItem({ index, title, detail }: { index: number; title: string; detail: string }) {
  return (
    <div className="expert-action-item">
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <XSquare />
    </div>
  );
}

function EvidenceBlock({ title, code, description }: { title: string; code: string; description: string }) {
  return (
    <section className="expert-evidence-block">
      <h3>
        {title}
        <ChevronDown />
      </h3>
      <div>
        <strong>{code}</strong>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function ExpertPortalPage() {
  const params = useParams();
  const location = useLocation();
  const reviewId = Number(params.id);
  if (Number.isFinite(reviewId) && reviewId > 0) {
    return <SingleReviewWorkspace prescriptionId={reviewId} />;
  }
  return <TriageDashboard key={location.pathname} />;
}
