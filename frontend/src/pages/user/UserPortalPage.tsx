import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ActivitySquare,
  AlertTriangle,
  BarChart,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  PlayCircle,
  ShieldAlert,
  TrendingUp,
  User
} from "lucide-react";

import {
  adjustFeedback,
  exportPhaseAssessmentPdfReport,
  exportPhaseAssessmentReport,
  getPhaseAssessment,
  type FeedbackAdjustment,
  type PhaseAssessment
} from "../../api/feedback";
import {
  exportPrescriptionPdfReport,
  exportPrescriptionReport,
  generatePrescription,
  listMyPrescriptions,
  type PrescriptionRecord
} from "../../api/prescriptions";
import { classifyMe } from "../../api/clusters";
import {
  acceptConsent,
  createBiochemicalIndex,
  createBodyComposition,
  createExerciseFeedback,
  createFitnessTest,
  createRiskScreening,
  upsertProfile,
  type HealthPayload
} from "../../api/healthData";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import { performLogout } from "../../auth/session";
import "./user-portal.css";

export type UserPortalView = "dashboard" | "onboarding" | "risk-result" | "prescription" | "today" | "phase-report";

type PortalTone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "purple" | "orange" | "teal";
type PortalNotice = { type: "info" | "success" | "warning" | "error"; message: string; description?: string };

const navItems: Array<{ id: UserPortalView; icon: typeof LayoutDashboard; label: string; path: string }> = [
  { id: "dashboard", icon: LayoutDashboard, label: "工作台首页", path: "/user/dashboard" },
  { id: "onboarding", icon: FileText, label: "健康建档向导", path: "/user/health-data" },
  { id: "risk-result", icon: ActivitySquare, label: "风险评估结果", path: "/user/risk-result" },
  { id: "prescription", icon: FileText, label: "最新运动处方", path: "/user/prescriptions" },
  { id: "today", icon: PlayCircle, label: "今日运动打卡", path: "/user/today" },
  { id: "phase-report", icon: BarChart, label: "阶段评估报告", path: "/user/phase-report" }
];

const fallbackSummary: UserDashboardSummary = {
  current_risk_level: "R1",
  expert_review_status: "PUBLISHED",
  today_can_exercise: true,
  today_block_reason: null,
  weekly_completion_rate: 80,
  current_stage_goals: ["建档与运动执行"],
  recent_feedback: null,
  monitoring_reminders: ["运动前安全确认", "阶段复评提醒"],
  prescription_id: 10,
  prescription_version: 2,
  next_reassessment_date: "2026-06-28",
  streak_days: 3,
  weekly_target_hits: 3,
  plan_completion_trend: [60, 80, 100, 0, 0, 0, 0],
  feedback_trend: [],
  health_radar: [],
  abnormal_feedback_count: 0,
  review_status_label: "已发布",
  prescription_summary: {
    cluster_label: "代谢风险",
    fitt_vp: {
      frequency: "每周 3 次",
      intensity: "中低强度 (RPE 4-6)",
      time: "每次 30-40 分钟",
      type: ["24式太极拳"],
      volume: "每周累计约 120 分钟",
      progression: "每两周根据心率微调"
    },
    safety_notice: "避免高冲击跳跃动作；避免长时间憋气。",
    reassessment: "4周复评"
  }
};

const fallbackPrescription: PrescriptionRecord = {
  id: 10,
  risk_level: "R1",
  cluster_label: "代谢风险",
  goals: ["增强心肺", "体重管理"],
  fitt_vp: {
    frequency: "每周 3-4 次",
    intensity: "中低强度 (RPE 4-6)",
    time: "每次 30-40 分钟",
    type: ["快走", "八段锦"],
    volume: "每周累计约 120 分钟",
    progression: "每两周根据心率微调"
  },
  precautions: ["饭后 1 小时进行运动", "运动中出现头晕、心慌请立即停止"],
  contraindications: ["高冲击跳跃动作", "大重量深蹲", "长时间憋气"],
  reassessment: "4周复评",
  evidence_refs: [],
  safety_notice: "系统检测到轻度膝关节磨损风险，运动时请避免高冲击跳跃动作。",
  status: "PUBLISHED",
  expert_review_required: false,
  version: 2,
  created_at: "2026-06-02T00:00:00"
};

const consentPayload = {
  consent_version: "2026-v1",
  consent_text: "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务，并理解系统提供运动指导与处方辅助，不替代临床医疗诊断。"
};

const profilePayload: HealthPayload = {
  name: "处方用户",
  sex: "男",
  birth_date: "1988-01-01",
  height_cm: 170,
  weight_kg: 82,
  waist_cm: 96,
  hip_cm: 102,
  occupation_type: "久坐办公",
  sedentary_hours: 8,
  sleep_hours: 7,
  exercise_goal: ["增强心肺", "体重管理"],
  exercise_habit: "无规律运动",
  exercise_experience: "初级"
};

const fitnessTestPayload: HealthPayload = {
  resting_hr: 78,
  sbp: 128,
  dbp: 82,
  vital_capacity: 3200,
  grip_left: 32,
  grip_right: 35,
  sit_reach: 8,
  single_leg_stand: 22,
  pain_score: 1,
  rpe_baseline: 4,
  source: "user_portal"
};

const bodyCompositionPayload: HealthPayload = {
  body_fat_pct: 31,
  skeletal_muscle_kg: 25,
  visceral_fat_level: 12,
  bmr: 1580,
  body_type: "代谢风险关注",
  device_model: "manual",
  is_fasting: true
};

const biochemicalPayload: HealthPayload = {
  fbg: 5.8,
  tc: 5,
  tg: 1.5,
  hdl_c: 1.1,
  ldl_c: 3,
  spo2: 98,
  source: "user_portal"
};

function asText(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).join("、") || fallback;
  return String(value);
}

function fittValue(source: Record<string, unknown> | null | undefined, key: string, fallback: string) {
  return asText(source?.[key], fallback);
}

function reviewLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    PUBLISHED: "已发布",
    APPROVED: "已发布",
    PENDING_REVIEW: "待专家审核",
    IN_REVIEW: "审核中",
    REFERRED: "已转介",
    REJECTED: "已退回"
  };
  return labels[String(status ?? "")] ?? String(status || "待生成");
}

function daysUntil(dateText: string | null | undefined) {
  if (!dateText) return 12;
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return 12;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function saveHealthDraft(hasRedFlag: boolean) {
  const riskPayload: HealthPayload = {
    has_hypertension: false,
    has_diabetes: false,
    has_chd: false,
    has_stroke: false,
    has_ckd: false,
    has_respiratory_disease: false,
    has_joint_pain: false,
    pain_location: [],
    recent_injury: false,
    medication: [],
    chest_pain: hasRedFlag,
    syncope: false,
    abnormal_dyspnea: false,
    palpitation: false,
    doctor_restriction: "无",
    parq_result: hasRedFlag ? "阳性" : "阴性"
  };

  await acceptConsent(consentPayload);
  await upsertProfile(profilePayload);
  await createFitnessTest({ ...fitnessTestPayload, pain_score: hasRedFlag ? 7 : 1 });
  await createBodyComposition(bodyCompositionPayload);
  await createBiochemicalIndex(biochemicalPayload);
  return createRiskScreening(riskPayload);
}

function PortalButton({
  children,
  type = "default",
  danger = false,
  disabled = false,
  className = "",
  onClick
}: {
  children: ReactNode;
  type?: "default" | "primary" | "text";
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`up-button up-button-${type}${danger ? " is-danger" : ""}${disabled ? " is-disabled" : ""} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PortalCard({
  title,
  children,
  className = "",
  bodyClassName = ""
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`up-card ${className}`}>
      {title ? (
        <header className="up-card-head">
          <h3>{title}</h3>
        </header>
      ) : null}
      <div className={`up-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function PortalAlert({
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
    <div className={`up-alert up-alert-${type}`}>
      {icon ? <span className="up-alert-icon">{icon}</span> : null}
      <div>
        <strong>{message}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

function PortalBadge({ status = "default", text }: { status?: "processing" | "success" | "warning" | "error" | "default"; text: string }) {
  return (
    <span className={`up-badge up-badge-${status}`}>
      <span />
      {text}
    </span>
  );
}

function UserPortalShell({ view, children }: { view: UserPortalView; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = navItems.find((item) => item.id === view) ?? navItems[0];
  const userName = localStorage.getItem("current_user_name") || "测试用户";
  const email = localStorage.getItem("current_user_email") || "user@example.com";
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await performLogout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="user-portal-shell">
      <aside className="user-portal-sidebar">
        <Link to="/user/dashboard" className="user-portal-brand" aria-label="启衡用户门户首页">
          <span className="user-portal-brand-mark">启</span>
          <span>启衡中台</span>
        </Link>

        <nav className="user-portal-nav" aria-label="用户门户 (USER)">
          <div className="user-portal-nav-title">用户门户 (USER)</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === view || location.pathname === item.path;
            return (
              <Link key={item.id} to={item.path} className={`user-portal-nav-item${isActive ? " is-active" : ""}`} aria-current={isActive ? "page" : undefined}>
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="user-portal-account">
          <div className="user-portal-avatar">U</div>
          <div>
            <strong>{userName}</strong>
            <small>{email}</small>
          </div>
          <button type="button" className="user-portal-logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut aria-hidden="true" />
            <span>{loggingOut ? "退出中" : "退出登录"}</span>
          </button>
        </div>
      </aside>

      <main className="user-portal-main">
        <div className="user-portal-grid-bg" aria-hidden="true" />
        <header className="user-portal-header">
          <h1>{active.label}</h1>
          <PortalBadge status="success" text="临床系统安全运行中" />
        </header>
        <div className="user-portal-scroll">{children}</div>
      </main>
    </div>
  );
}

function DashboardView() {
  const [summary, setSummary] = useState<UserDashboardSummary>(fallbackSummary);

  useEffect(() => {
    let active = true;
    getUserDashboard()
      .then((data) => {
        if (active) setSummary({ ...fallbackSummary, ...data });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const fitt = summary.prescription_summary?.fitt_vp ?? fallbackSummary.prescription_summary?.fitt_vp ?? {};
  const trend = summary.plan_completion_trend?.length ? summary.plan_completion_trend : fallbackSummary.plan_completion_trend;
  const canExercise = Boolean(summary.today_can_exercise);
  const dayCount = daysUntil(summary.next_reassessment_date);

  return (
    <div className="up-view up-fade-in">
      <section className={`up-decision up-decision-${canExercise ? "success" : "warning"}`}>
        <div className="up-decision-main">
          <CheckCircle aria-hidden="true" />
          <div>
            <h2>{canExercise ? "今日可进行运动" : "今日暂不进行运动"}</h2>
            <p>当前风险等级：{summary.current_risk_level || "待评估"} {summary.today_block_reason ? `· ${summary.today_block_reason}` : ""}</p>
          </div>
        </div>
        <Link to={canExercise ? "/user/today" : "/user/risk-result"}>
          <PortalButton type="primary" className={canExercise ? "up-button-success" : ""}>
            {canExercise ? "开始今日任务" : "查看安全建议"}
          </PortalButton>
        </Link>
      </section>

      <div className="up-grid up-grid-3">
        <PortalCard title="当前执行处方" className="up-span-2">
          <div className="up-chip-row">
            <span>{fittValue(fitt, "type", "24式太极拳")}</span>
            <span>{fittValue(fitt, "frequency", "每周 3 次")}</span>
            <span>{fittValue(fitt, "intensity", "中低强度 (RPE 4-6)")}</span>
          </div>
          <PortalAlert
            type="warning"
            icon={<AlertTriangle />}
            message="禁忌与限制"
            description={summary.prescription_summary?.safety_notice || "避免高冲击跳跃动作；避免长时间憋气。"}
          />
        </PortalCard>
        <PortalCard title="阶段复评倒计时" bodyClassName="up-countdown-card">
          <div className="up-countdown">
            <svg viewBox="0 0 132 132" aria-hidden="true">
              <circle cx="66" cy="66" r="58" />
              <circle cx="66" cy="66" r="58" pathLength="100" strokeDasharray="100" strokeDashoffset="28" />
            </svg>
            <strong>{dayCount}</strong>
            <span>天</span>
          </div>
          <p>预计 {summary.next_reassessment_date || "2026-06-28"} 进行阶段复评</p>
        </PortalCard>
      </div>

      <div className="up-grid up-grid-2">
        <PortalCard title="本周完成率">
          <div className="up-bar-chart" aria-label="本周完成率">
            {["一", "二", "三", "四", "五", "六", "日"].map((day, index) => (
              <div key={day} className="up-bar-item">
                <div className="up-bar-track">
                  <span style={{ height: `${Math.min(100, Math.max(0, trend[index] ?? 0))}%` }} />
                </div>
                <small>周{day}</small>
              </div>
            ))}
          </div>
        </PortalCard>
        <PortalCard title="健康画像">
          <div className="up-radar-wrap">
            <div className="up-radar">
              <span className="axis-x" />
              <span className="axis-y" />
              <span className="shape" />
              <b>心肺</b>
              <b>代谢</b>
              <b>肌力</b>
              <b>柔韧</b>
            </div>
          </div>
        </PortalCard>
      </div>
    </div>
  );
}

function OnboardingView() {
  const [hasRedFlag, setHasRedFlag] = useState(false);
  const [notice, setNotice] = useState<PortalNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const steps = [
    { step: 1, title: "基础档案", status: "done" },
    { step: 2, title: "体质测试", status: "done" },
    { step: 3, title: "体成分指标", status: "done" },
    { step: 4, title: "生化指标", status: "done" },
    { step: 5, title: "风险筛查问卷", status: "active" },
    { step: 6, title: "生成风险结果", status: "wait" }
  ];

  const handleSaveDraft = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await saveHealthDraft(hasRedFlag);
      setNotice({
        type: "success",
        message: "健康建档草稿已保存",
        description: "知情同意、基础档案、体测、体成分、生化指标和风险问卷已写入后端。"
      });
    } catch (error) {
      setNotice({ type: "error", message: "健康建档保存失败", description: errorText(error, "请检查网络或稍后重试。") });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAssessment = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      await saveHealthDraft(false);
      const cluster = await classifyMe();
      const prescription = await generatePrescription();
      setNotice({
        type: prescription.risk_level === "R3" ? "warning" : "success",
        message: "评估结果已生成",
        description: `分型：${cluster.cluster_label || "待补充分型"}；处方：${prescription.risk_level} ${reviewLabel(prescription.status)}。`
      });
    } catch (error) {
      setNotice({ type: "error", message: "评估结果生成失败", description: errorText(error, "请确认最小必填集已完整保存。") });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="up-onboarding up-fade-in">
      <aside className="up-step-rail">
        {steps.map((item, index) => (
          <div key={item.step} className="up-step-item">
            <span className={`up-step-dot is-${item.status}`}>{item.status === "done" ? "✓" : item.step}</span>
            {index < steps.length - 1 ? <span className="up-step-line" /> : null}
            <strong className={item.status === "active" ? "is-active" : ""}>{item.title}</strong>
          </div>
        ))}
      </aside>

      <section className="up-form-panel">
        <header>
          <h2>第五步：慢病与风险问卷</h2>
        </header>
        <div className="up-form-body">
          <section className="up-field-block">
            <h3>
              <Activity aria-hidden="true" />
              心血管与红旗症状筛查
            </h3>
            <p>近 3 个月内，您是否出现过以下症状？（可多选）</p>
            <div className="up-checkbox-list">
              <label>
                <input type="checkbox" checked={hasRedFlag} onChange={(event) => setHasRedFlag(event.target.checked)} />
                <span>不明原因的胸痛、胸闷或心前区压榨感</span>
              </label>
              <label>
                <input type="checkbox" />
                <span>晕厥、黑蒙或原因不明的头晕跌倒</span>
              </label>
              <label>
                <input type="checkbox" />
                <span>轻微日常活动即出现严重的喘憋或气短</span>
              </label>
            </div>
            {hasRedFlag ? (
              <PortalAlert
                type="error"
                icon={<ShieldAlert />}
                message="触发医疗转介警告"
                description="系统检测到红旗信号。为保障您的安全，系统将中止生成训练计划，并强烈建议您尽快寻求临床医学评估。"
              />
            ) : null}
          </section>
          <section className="up-field-block up-field-block-white">
            <h3>慢性病史</h3>
            <div className="up-disease-grid">
              {["高血压", "糖尿病", "高脂血症", "冠心病"].map((disease) => (
                <label key={disease}>
                  <input type="checkbox" />
                  <span>{disease}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <footer>
          <PortalButton>上一步</PortalButton>
          <div>
            <PortalButton disabled={saving || generating} onClick={handleSaveDraft}>
              {saving ? "保存中..." : "保存草稿"}
            </PortalButton>
            <PortalButton type="primary" disabled={hasRedFlag || saving || generating} onClick={handleGenerateAssessment}>
              {generating ? "生成中..." : "生成评估结果"}
            </PortalButton>
          </div>
        </footer>
        {notice ? (
          <div className="up-inline-notice">
            <PortalAlert type={notice.type} icon={notice.type === "error" ? <AlertTriangle /> : <CheckCircle />} message={notice.message} description={notice.description} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RiskResultView() {
  const [summary, setSummary] = useState<UserDashboardSummary>(fallbackSummary);

  useEffect(() => {
    let active = true;
    getUserDashboard()
      .then((data) => {
        if (active) setSummary({ ...fallbackSummary, ...data });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const risk = summary.current_risk_level || "R2";
  const isR3 = risk === "R3";
  const title = isR3 ? "评估结果：R3 高风险转介型" : risk === "R1" ? "评估结果：R1 低风险改善型" : "评估结果：R2 中风险干预型";

  return (
    <div className="up-risk-result up-fade-in">
      <section className={`up-result-card tone-${isR3 ? "danger" : risk === "R1" ? "success" : "warning"}`}>
        <AlertTriangle aria-hidden="true" />
        <h2>{title}</h2>
        <p>
          {isR3
            ? "系统识别到高风险信号，当前不生成训练计划，仅展示医学评估建议和安全边界。"
            : "根据您的健康数据，系统已为您生成谨慎型处方初稿。基于医疗安全规范，该处方必须经过运动处方专家审核后方可发布执行。"}
        </p>
        <div>
          <Link to="/user/health-data">
            <PortalButton>重新填写数据</PortalButton>
          </Link>
          <Link to="/user/prescriptions">
            <PortalButton type="primary" className="up-button-warning">
              {isR3 ? "查看医学评估建议" : "提交专家审核"}
            </PortalButton>
          </Link>
        </div>
      </section>

      <section className="up-evidence-card">
        <header>
          <Info aria-hidden="true" />
          <h3>触发规则与评判依据</h3>
        </header>
        <div className="up-rule-row">
          <PortalBadge status={isR3 ? "error" : "warning"} text={isR3 ? "红牌规则" : "黄牌规则"} />
          <div>
            <strong>{isR3 ? "红旗症状或禁忌运动信号" : "稳定高血压边界风险"}</strong>
            <p>依据：建档记录显示存在高血压病史，且本次体测收缩压处于关注区间。</p>
            <span>约束操作：进入风险阻断或专家审核，并自动附加相应禁忌。</span>
          </div>
        </div>
      </section>

      <section className="up-cluster-panel">
        <h4>辅助人群分型标签</h4>
        <div className="up-tag-row">
          <span>肥胖代谢风险型</span>
          <span>久坐低体能型</span>
        </div>
        <p>* 注：人群分型由聚类算法与规则联合生成，仅用于辅助匹配处方模板，不覆盖上方医疗风险底线规则。</p>
      </section>
    </div>
  );
}

function PrescriptionView() {
  const [items, setItems] = useState<PrescriptionRecord[]>([fallbackPrescription]);
  const [exportNotice, setExportNotice] = useState<PortalNotice | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(true);

  useEffect(() => {
    let active = true;
    listMyPrescriptions(true)
      .then((records) => {
        if (active && records.length) setItems(records);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingPrescriptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const latest = items[0] ?? fallbackPrescription;
  const fitt = latest.fitt_vp ?? fallbackPrescription.fitt_vp ?? {};
  const isLocked = latest.risk_level === "R3" || (latest.risk_level === "R2" && latest.status !== "PUBLISHED");
  const fittCards = [
    { label: "频率 (Frequency)", value: fittValue(fitt, "frequency", "每周 3-4 次"), icon: Calendar, tone: "info" as PortalTone },
    { label: "强度 (Intensity)", value: fittValue(fitt, "intensity", "中低强度 (RPE 4-6)"), icon: Activity, tone: "teal" as PortalTone },
    { label: "时间 (Time)", value: fittValue(fitt, "time", "每次 30-40 分钟"), icon: Clock, tone: "purple" as PortalTone },
    { label: "类型 (Type)", value: fittValue(fitt, "type", "快走、八段锦"), icon: User, tone: "purple" as PortalTone },
    { label: "总量 (Volume)", value: fittValue(fitt, "volume", "每周累计约 120 分钟"), icon: BarChart, tone: "orange" as PortalTone },
    { label: "进阶 (Progression)", value: fittValue(fitt, "progression", "每两周根据心率微调"), icon: TrendingUp, tone: "danger" as PortalTone }
  ];

  const handleExport = async (format: "pdf" | "docx") => {
    setExporting(format);
    setExportNotice(null);
    try {
      const blob = format === "pdf" ? await exportPrescriptionPdfReport(latest.id) : await exportPrescriptionReport(latest.id);
      downloadBlob(blob, `exercise-prescription-${latest.id}.${format}`);
      setExportNotice({
        type: "success",
        message: format === "pdf" ? "处方 PDF 已导出" : "处方 DOCX 已导出",
        description: "报告由后端生成并记录导出审计，适合归档或提交专家复核。"
      });
    } catch (error) {
      setExportNotice({ type: "error", message: "处方报告导出失败", description: errorText(error, "请稍后重试或联系管理员检查报告服务。") });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="up-prescription up-fade-in">
      <header className="up-page-title-row">
        <div>
          <div className="up-title-with-badge">
            <h2>个性化运动处方</h2>
            <PortalBadge status={latest.status === "PUBLISHED" ? "processing" : "warning"} text={`${reviewLabel(latest.status)} (V${latest.version}.0)`} />
          </div>
          <p>
            风险: {latest.risk_level} <ChevronRight aria-hidden="true" /> 分型: {latest.cluster_label || "代谢风险"} <ChevronRight aria-hidden="true" /> 知识增强: 匹配
          </p>
        </div>
        <div className="up-action-row">
          <PortalButton disabled={loadingPrescriptions || exporting !== null} onClick={() => handleExport("docx")}>
            <Download aria-hidden="true" />
            {loadingPrescriptions ? "加载中..." : exporting === "docx" ? "导出中..." : "导出 DOCX"}
          </PortalButton>
          <PortalButton disabled={loadingPrescriptions || exporting !== null} onClick={() => handleExport("pdf")}>
            <Download aria-hidden="true" />
            {loadingPrescriptions ? "加载中..." : exporting === "pdf" ? "导出中..." : "导出 PDF"}
          </PortalButton>
        </div>
      </header>

      {exportNotice ? (
        <div className="up-inline-notice">
          <PortalAlert
            type={exportNotice.type}
            icon={exportNotice.type === "error" ? <AlertTriangle /> : <CheckCircle />}
            message={exportNotice.message}
            description={exportNotice.description}
          />
        </div>
      ) : null}

      {!isLocked ? (
        <section className="up-fitt-grid">
          {fittCards.map((item) => {
            const Icon = item.icon;
            return (
              <PortalCard key={item.label} className="up-fitt-card">
                <div className={`up-fitt-icon tone-${item.tone}`}>
                  <Icon aria-hidden="true" />
                </div>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              </PortalCard>
            );
          })}
        </section>
      ) : (
        <PortalAlert
          type={latest.risk_level === "R3" ? "error" : "warning"}
          icon={<ShieldAlert />}
          message={latest.risk_level === "R3" ? "当前不展示训练计划" : "专家审核前不展示训练计划"}
          description={latest.risk_level === "R3" ? "高风险场景仅显示医学评估建议。" : "处方发布前不展示动作、强度和进阶计划。"}
        />
      )}

      <div className="up-alert-stack">
        <PortalAlert
          type="error"
          icon={<ShieldAlert />}
          message="禁忌动作与临床限制"
          description={latest.contraindications?.length ? latest.contraindications.join("；") : "避免高冲击跳跃动作（如跳绳、波比跳）、大重量深蹲。"}
        />
        <PortalAlert
          type="warning"
          icon={<AlertTriangle />}
          message="注意事项"
          description={latest.precautions?.length ? latest.precautions.join("；") : "建议在饭后 1 小时进行运动，切忌空腹剧烈运动以防低血糖。"}
        />
      </div>
    </div>
  );
}

function TodayGatekeeperView() {
  const [gatePassed, setGatePassed] = useState(false);
  const [summary, setSummary] = useState<UserDashboardSummary>(fallbackSummary);
  const [exerciseType, setExerciseType] = useState("快走");
  const [durationMin, setDurationMin] = useState(30);
  const [avgHr, setAvgHr] = useState("");
  const [rpe, setRpe] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<PortalNotice | null>(null);

  useEffect(() => {
    let active = true;
    getUserDashboard()
      .then((data) => {
        if (active) setSummary({ ...fallbackSummary, ...data });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const handleFeedbackSubmit = async () => {
    setSubmitting(true);
    setFeedbackNotice(null);
    try {
      const feedback = await createExerciseFeedback({
        prescription_id: summary.prescription_id,
        pre_exercise_confirmed: true,
        exercise_date: todayISO(),
        exercise_type: exerciseType,
        frequency_week: 1,
        duration_min: durationMin,
        intensity_level: "中低强度",
        avg_hr: avgHr ? Number(avgHr) : null,
        rpe,
        completion_rate: 100,
        discomfort: ["无"],
        pain_score_after: 0,
        source: "user_portal"
      });
      const feedbackId = Number((feedback as { id?: number }).id);
      let adjustment: FeedbackAdjustment | null = null;
      if (feedbackId) {
        adjustment = await adjustFeedback(feedbackId);
      }
      setFeedbackNotice({
        type: adjustment?.action === "RED_ALERT" || adjustment?.action === "REVIEW_REQUIRED" ? "warning" : "success",
        message: "今日反馈已上传",
        description: adjustment ? `动态调整：${adjustment.action}` : "反馈已记录，暂无可执行的动态调整。"
      });
    } catch (error) {
      setFeedbackNotice({ type: "error", message: "今日反馈上传失败", description: errorText(error, "请检查反馈信息或稍后重试。") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="up-today up-fade-in">
      {!gatePassed ? (
        <PortalCard className="up-gate-card">
          <div className="up-gate-copy">
            <span className="up-gate-icon">
              <ShieldAlert aria-hidden="true" />
            </span>
            <h2>运动前安全确认</h2>
            <p>
              今天您是否有<strong>胸痛</strong>、<strong>严重气短</strong>或<strong>关节疼痛明显加重</strong>？
            </p>
            <div className="up-gate-actions">
              <PortalButton danger className="up-gate-action">
                是，我有不适
              </PortalButton>
              <PortalButton type="primary" className="up-button-success up-gate-action" onClick={() => setGatePassed(true)}>
                否，状态良好
              </PortalButton>
            </div>
            <small>为了您的医疗安全，每次打卡前必须进行自我评估。</small>
          </div>
        </PortalCard>
      ) : (
        <section className="up-feedback-panel">
          <header>
            <h2>今日运动打卡</h2>
            <PortalButton type="text" onClick={() => setGatePassed(false)}>
              重新评估
            </PortalButton>
          </header>
          <PortalCard>
            <div className="up-feedback-form">
              <label>
                <span>执行的运动项目</span>
                <div className="up-choice-row">
                  {["快走", "八段锦"].map((item) => (
                    <button key={item} type="button" className={exerciseType === item ? "is-selected" : ""} onClick={() => setExerciseType(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </label>
              <div className="up-form-grid-2">
                <label>
                  <span>实际时长 (分钟)</span>
                  <input type="number" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value) || 0)} />
                </label>
                <label>
                  <span>运动后心率 (bpm)</span>
                  <input type="number" placeholder="选填" value={avgHr} onChange={(event) => setAvgHr(event.target.value)} />
                </label>
              </div>
              <label>
                <span className="up-form-label-row">
                  主观疲劳感知 (RPE)
                  <strong>{rpe} - {rpe <= 3 ? "轻松" : rpe <= 6 ? "有些吃力" : "偏高"}</strong>
                </span>
                <input type="range" min={0} max={10} value={rpe} onChange={(event) => setRpe(Number(event.target.value))} />
                <small className="up-range-labels">
                  <span>0 (轻松)</span>
                  <span>5 (中等)</span>
                  <span>10 (极限)</span>
                </small>
              </label>
              {feedbackNotice ? (
                <PortalAlert
                  type={feedbackNotice.type}
                  icon={feedbackNotice.type === "error" ? <AlertTriangle /> : <CheckCircle />}
                  message={feedbackNotice.message}
                  description={feedbackNotice.description}
                />
              ) : null}
              <footer>
                <PortalButton type="primary" disabled={submitting} onClick={handleFeedbackSubmit}>
                  {submitting ? "上传中..." : "提交反馈并上传"}
                </PortalButton>
              </footer>
            </div>
          </PortalCard>
        </section>
      )}
    </div>
  );
}

function PhaseReportView() {
  const [assessment, setAssessment] = useState<PhaseAssessment | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [exportNotice, setExportNotice] = useState<PortalNotice | null>(null);

  useEffect(() => {
    let active = true;
    getPhaseAssessment(4)
      .then((data) => {
        if (active) setAssessment(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const decision = assessment?.decision ?? "MAINTAIN";
  const completion = assessment?.average_completion_rate ?? 82;
  const rpe = assessment?.average_rpe ?? 5.6;
  const pain = assessment?.pain_events ?? 1;

  const handlePhaseExport = async (format: "pdf" | "docx") => {
    setExporting(format);
    setExportNotice(null);
    try {
      const blob = format === "pdf" ? await exportPhaseAssessmentPdfReport(4) : await exportPhaseAssessmentReport(4);
      downloadBlob(blob, `phase-assessment-4w.${format}`);
      setExportNotice({
        type: "success",
        message: format === "pdf" ? "阶段 PDF 已导出" : "阶段 DOCX 已导出",
        description: "阶段报告已按近 4 周评估窗口生成，包含反馈、安全事件与复评建议。"
      });
    } catch (error) {
      setExportNotice({ type: "error", message: "阶段报告导出失败", description: errorText(error, "请稍后重试或确认报告服务可用。") });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="up-phase up-fade-in">
      <section className="up-phase-hero">
        <div>
          <PortalBadge status={decision === "REVIEW_REQUIRED" ? "warning" : "success"} text={decision === "REVIEW_REQUIRED" ? "专家复核" : "阶段稳定"} />
          <h2>阶段评估报告</h2>
          <p>{assessment?.summary || "四周反馈、安全事件与指标变化的复评视图，后续可补充完整导出与指标追踪入口。"}</p>
        </div>
        <div className="up-phase-actions">
          <PortalButton disabled={exporting !== null} onClick={() => handlePhaseExport("docx")}>
            <Download aria-hidden="true" />
            {exporting === "docx" ? "导出中..." : "导出 DOCX"}
          </PortalButton>
          <PortalButton disabled={exporting !== null} onClick={() => handlePhaseExport("pdf")}>
            <Download aria-hidden="true" />
            {exporting === "pdf" ? "导出中..." : "导出 PDF"}
          </PortalButton>
        </div>
      </section>
      {exportNotice ? (
        <div className="up-inline-notice">
          <PortalAlert
            type={exportNotice.type}
            icon={exportNotice.type === "error" ? <AlertTriangle /> : <CheckCircle />}
            message={exportNotice.message}
            description={exportNotice.description}
          />
        </div>
      ) : null}
      <section className="up-metric-grid">
        <PortalCard>
          <small>平均完成率</small>
          <strong>{completion}%</strong>
          <span>近 4 周</span>
        </PortalCard>
        <PortalCard>
          <small>平均 RPE</small>
          <strong>{rpe}</strong>
          <span>主观疲劳</span>
        </PortalCard>
        <PortalCard>
          <small>疼痛事件</small>
          <strong>{pain}</strong>
          <span>需要持续观察</span>
        </PortalCard>
      </section>
      <PortalCard title="复评建议">
        <div className="up-recommend-list">
          {(assessment?.recommendations?.length ? assessment.recommendations : ["维持当前处方", "继续记录每次运动反馈", "复评前补充血压与体成分指标"]).map((item) => (
            <span key={item}>
              <CheckCircle aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </PortalCard>
    </div>
  );
}

export function UserPortalPage({ view }: { view: UserPortalView }) {
  const content = useMemo(() => {
    switch (view) {
      case "onboarding":
        return <OnboardingView />;
      case "risk-result":
        return <RiskResultView />;
      case "prescription":
        return <PrescriptionView />;
      case "today":
        return <TodayGatekeeperView />;
      case "phase-report":
        return <PhaseReportView />;
      case "dashboard":
      default:
        return <DashboardView />;
    }
  }, [view]);

  return <UserPortalShell view={view}>{content}</UserPortalShell>;
}
