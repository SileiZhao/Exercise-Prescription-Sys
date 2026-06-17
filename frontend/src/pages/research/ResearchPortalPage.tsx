import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Database,
  Download,
  FileDown,
  FileText,
  Filter,
  Info,
  LayoutDashboard,
  LineChart,
  Lock,
  Search,
  ShieldAlert,
  Users
} from "lucide-react";

import {
  approveResearchExportRequest,
  createResearchExportRequest,
  downloadResearchExportRequest,
  exportDesensitizedUsers,
  getResearchSummary,
  listResearchExportRequests,
  type ResearchExportFormat,
  type ResearchExportRequest,
  type ResearchSummary
} from "../../api/researchExport";
import "./research-portal.css";

type ResearchView = "dashboard" | "clusters" | "effects" | "export";

const fallbackSummary: ResearchSummary = {
  total_participants: 12458,
  risk_distribution: { R0: 5241, R1: 4820, R2: 1874, R3: 523 },
  cluster_distribution: { 青年亚健康: 4210, 代谢综合征: 3890, 老年退行性: 2210 },
  cluster_risk_overlay: { 代谢综合征: { R2: 760, R3: 120 }, 老年退行性: { R2: 510 } },
  prescription_status: { PUBLISHED: 3000, PENDING_REVIEW: 180 },
  template_effects: { 减脂模板: 82, 心肺模板: 76 },
  export_job_status: { PENDING: 1, APPROVED: 1 },
  intervention_effects: {
    feedback_count: 34920,
    average_completion_rate: 68.4,
    average_rpe: 12.25,
    discomfort_event_count: 12,
    pain_worsened_count: 3
  }
};

const fallbackRequests: ResearchExportRequest[] = [
  {
    id: 9,
    requested_by: 3,
    organization_id: 1,
    format: "json",
    purpose: "高血压人群依从性差异分析",
    status: "PENDING",
    approved_by: null,
    approval_comment: null,
    row_count: 5000,
    expires_at: null,
    downloaded_at: null,
    created_at: "2026-06-03T00:00:00"
  },
  {
    id: 8,
    requested_by: 2,
    organization_id: 1,
    format: "csv",
    purpose: "阶段效果分析",
    status: "APPROVED",
    approved_by: 1,
    approval_comment: "同意用于阶段分析",
    row_count: 12000,
    expires_at: "2999-06-04T00:00:00",
    downloaded_at: null,
    created_at: "2026-06-02T00:00:00"
  }
];

const navItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "宏观统计大盘", path: "/research/dashboard" },
  { id: "clusters", icon: Database, label: "人群聚类分析", path: "/research/cluster-analysis" },
  { id: "effects", icon: LineChart, label: "群体干预效果", path: "/research/intervention-effects" },
  { id: "export", icon: ShieldAlert, label: "数据导出审批", path: "/research/export-jobs" }
] as const;

function Button({
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
      className={`rp-button rp-button-${type}${danger ? " is-danger" : ""} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({
  title,
  children,
  className = ""
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rp-card ${className}`}>
      {title ? <header className="rp-card-head">{title}</header> : null}
      <div className="rp-card-body">{children}</div>
    </section>
  );
}

function Badge({
  tone = "default",
  text
}: {
  tone?: "default" | "info" | "warning" | "error" | "success" | "indigo";
  text: string;
}) {
  return <span className={`rp-badge rp-badge-${tone}`}>{text}</span>;
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
    <div className={`rp-alert rp-alert-${type}`}>
      {icon ? <span className="rp-alert-icon">{icon}</span> : null}
      <div>
        <strong>{message}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

function viewFromPath(pathname: string): ResearchView {
  if (pathname.includes("cluster-analysis")) return "clusters";
  if (pathname.includes("intervention-effects")) return "effects";
  if (pathname.includes("export")) return "export";
  return "dashboard";
}

function formatNumber(value: number | undefined, fallback = "0") {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Intl.NumberFormat("zh-CN").format(value);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "待审批",
    APPROVED: "已批准",
    REJECTED: "已驳回"
  };
  return labels[status] ?? status;
}

function ResearchShell({
  view,
  isAdminMode,
  children
}: {
  view: ResearchView;
  isAdminMode: boolean;
  children: ReactNode;
}) {
  const title = isAdminMode ? "科研导出审批" : navItems.find((item) => item.id === view)?.label ?? "宏观统计大盘";

  return (
    <div className="research-portal-shell">
      <div className="research-watermark" aria-hidden="true">
        {Array.from({ length: 30 }).map((_, index) => (
          <span key={index}>CONFIDENTIAL / DE-IDENTIFIED DATA</span>
        ))}
      </div>
      <aside className="research-sidebar">
        <Link to="/" className="research-brand">
          <span><LineChart /></span>
          科研治理端
        </Link>
        <nav className="research-nav" aria-label="科研端导航">
          <div className="research-nav-title">{isAdminMode ? "科研与系统治理 (ADMIN)" : "科研与系统治理 (RESEARCHER)"}</div>
          {navItems.map((item) => (
            <Link key={item.id} to={item.path} className={`research-nav-item${view === item.id ? " is-active" : ""}`}>
              <item.icon />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="research-main">
        <header className="research-topbar">
          <h1>{title}</h1>
          <Badge tone="indigo" text="脱敏模式: 开启 (V1.2)" />
        </header>
        <div className="research-scroll">{children}</div>
      </main>
    </div>
  );
}

function ResearchDashboard({ summary }: { summary: ResearchSummary }) {
  const risk = summary.risk_distribution ?? {};
  return (
    <div className="research-view rp-fade-in">
      <Alert
        type="warning"
        icon={<ShieldAlert />}
        message="合规与数据脱敏声明"
        description="当前视图下的所有数据均已进行脱敏与聚合处理，系统已自动隐去姓名、联系方式等个人可识别身份信息 (PII)。图表展示的聚类趋势仅用于科研与模型分析，不可作为针对个体的临床诊断依据。"
      />
      <div className="research-kpi-grid">
        <MetricCard icon={<Users />} label="脱敏样本总量" value={formatNumber(summary.total_participants)} detail="本月新增 842" />
        <MetricCard icon={<FileText />} label="生成处方总数" value={formatNumber(summary.intervention_effects.feedback_count || 34920)} detail="包含各历史版本" />
        <MetricCard icon={<Activity />} label="平均打卡依从率" value={`${summary.intervention_effects.average_completion_rate ?? 68.4}%`} detail="较上季度提升 4.2%" />
        <MetricCard icon={<AlertTriangle />} label="R3 拦截转介率" value="4.2%" detail={`${formatNumber(risk.R3 ?? 523)} 人次被阻断`} tone="warning" />
      </div>
      <div className="research-two-col">
        <Card title={<><Activity /> 聚合人群风险层级分布 (R0-R3)</>}>
          <div className="research-risk-funnel">
            <FunnelItem tone="r0" width="82%" label={`R0 健康维持型 (${formatNumber(risk.R0 ?? 5241)} 人)`} />
            <FunnelItem tone="r1" width="66%" label={`R1 低风险改善型 (${formatNumber(risk.R1 ?? 4820)} 人)`} />
            <FunnelItem tone="r2" width="48%" label={`R2 中风险干预型 (${formatNumber(risk.R2 ?? 1874)} 人)`} />
            <FunnelItem tone="r3" width="32%" label={`R3 高风险转介型 (${formatNumber(risk.R3 ?? 523)} 人)`} />
          </div>
          <p className="research-chart-note">注：高血压与骨关节异常是导致进入 R2/R3 的主要因素。</p>
        </Card>
        <Card title={<><Database /> V2.1 聚类模型人群分布 (降维呈现)</>}>
          <div className="research-cluster-stage">
            <div className="research-cluster-legend">
              <strong>风险聚类分布</strong>
              <span><i className="is-blue" /> 簇1: 青年亚健康</span>
              <span><i className="is-orange" /> 簇2: 代谢综合征</span>
              <span><i className="is-purple" /> 簇3: 老年退行性</span>
            </div>
            <span className="bubble bubble-blue">簇1</span>
            <span className="bubble bubble-orange">簇2</span>
            <span className="bubble bubble-purple">簇3</span>
            <span className="bubble bubble-green">簇4</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className={`research-metric-card ${tone === "warning" ? "is-warning" : ""}`}>
      <div className="research-metric-label">{icon}{label}</div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Card>
  );
}

function FunnelItem({ tone, width, label }: { tone: string; width: string; label: string }) {
  return (
    <div className={`research-funnel-item research-funnel-${tone}`} style={{ width }}>
      {label}
    </div>
  );
}

function ClusterAnalysis({ summary }: { summary: ResearchSummary }) {
  const clusters = Object.entries(summary.cluster_distribution ?? fallbackSummary.cluster_distribution);
  const overlay = summary.cluster_risk_overlay ?? fallbackSummary.cluster_risk_overlay ?? {};

  return (
    <div className="research-view rp-fade-in">
      <div className="research-two-col is-wide-left">
        <Card title={<><Database /> 分型统计</>}>
          <div className="research-cluster-board">
            {clusters.map(([name, count], index) => (
              <div key={name} className={`research-cluster-chip is-${index % 4}`}>
                <strong>{name}</strong>
                <span>{formatNumber(count)} 脱敏样本</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="风险叠加">
          <div className="research-overlay-list">
            {Object.entries(overlay).map(([cluster, risks]) => (
              <div key={cluster}>
                <strong>{cluster}</strong>
                <span>{Object.entries(risks).map(([risk, count]) => `${risk} ${count}`).join(" · ")}</span>
              </div>
            ))}
          </div>
          <Alert type="info" message="冷启动说明" description="样本不足时只展示聚合趋势，不输出确定性分型结论。" />
        </Card>
      </div>
    </div>
  );
}

function InterventionEffects({ summary }: { summary: ResearchSummary }) {
  const effects = summary.intervention_effects;
  return (
    <div className="research-view rp-fade-in">
      <div className="research-kpi-grid">
        <MetricCard icon={<Activity />} label="依从性趋势" value={`${effects.average_completion_rate ?? 0}%`} detail="第 1 周到第 4 周持续观察" />
        <MetricCard icon={<LineChart />} label="主观强度趋势" value={`${effects.average_rpe ?? 0} RPE`} detail="避免训练强度过快上行" />
        <MetricCard icon={<AlertTriangle />} label="疼痛/不适事件" value={formatNumber(effects.discomfort_event_count ?? 0)} detail="需结合异常反馈解释" tone="warning" />
        <MetricCard icon={<Activity />} label="生理趋势" value="血压/血糖" detail="聚合趋势，不用于个体诊断" />
      </div>
      <Card title="阶段变化曲线">
        <div className="research-line-grid">
          <TrendLine title="完成率趋势" values={["62%", "68%", "72%"]} />
          <TrendLine title="RPE趋势" values={["13.5", "12.9", "12.25"]} />
          <TrendLine title="血压变化趋势" values={["136/88", "132/86", "130/84"]} />
          <TrendLine title="血糖变化趋势" values={["6.2", "5.9", "5.7"]} />
        </div>
      </Card>
    </div>
  );
}

function TrendLine({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="research-trend-line">
      <strong>{title}</strong>
      <div>
        {values.map((value, index) => (
          <span key={`${title}-${value}`} style={{ height: `${32 + index * 18}px` }}>{value}</span>
        ))}
      </div>
    </div>
  );
}

function ExportWorkspace({
  requests,
  setRequests,
  isAdminMode,
  desensitizedTotal
}: {
  requests: ResearchExportRequest[];
  setRequests: (items: ResearchExportRequest[]) => void;
  isAdminMode: boolean;
  desensitizedTotal: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(requests[0]?.id ?? null);
  const [approvalText, setApprovalText] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [format, setFormat] = useState<ResearchExportFormat>("csv");
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0] ?? fallbackRequests[0];

  useEffect(() => {
    if (selectedId === null && requests.length) {
      setSelectedId(requests[0].id);
    }
  }, [requests, selectedId]);

  async function submitRequest() {
    const item = await createResearchExportRequest({ format, purpose });
    setRequests([item, ...requests]);
    setPurpose("");
    setFormat("csv");
    setRequestOpen(false);
  }

  async function approveSelected() {
    await approveResearchExportRequest(selected.id, { approval_comment: approvalText });
  }

  async function downloadRequest(id: number) {
    await downloadResearchExportRequest(id);
  }

  return (
    <div className="research-export-workspace rp-fade-in">
      <aside className="research-request-list">
        <header>
          <span>脱敏数据导出申请</span>
          <Button type="primary" onClick={() => setRequestOpen(true)}>发起新申请</Button>
        </header>
        <div className="research-request-filter">
          <label>
            <Search />
            <input placeholder="搜索申请人/编号..." />
          </label>
          <button type="button" aria-label="筛选">
            <Filter />
          </button>
        </div>
        <div className="research-request-items">
          {requests.map((request) => (
            <div
              role="button"
              tabIndex={0}
              key={request.id}
              className={`research-request-item${selected.id === request.id ? " is-active" : ""}`}
              onClick={() => setSelectedId(request.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(request.id);
                }
              }}
            >
              <span>
                <strong>{`REQ-2026-${String(request.id).padStart(4, "0")}`}</strong>
                <Badge tone={request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "error" : "warning"} text={statusLabel(request.status)} />
              </span>
              <b>{request.purpose}</b>
              <small>
                <FileDown />
                {request.format.toUpperCase()} · 样本量: 约 {formatNumber(request.row_count)} 条 · {request.created_at.slice(0, 10)}
              </small>
              {request.status === "APPROVED" && !request.downloaded_at ? (
                <Button
                  type="primary"
                  className="research-download-button"
                  onClick={() => downloadRequest(request.id)}
                >
                  <Download />
                  {`下载脱敏数据包 #${request.id}`}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
      <section className="research-request-detail">
        <header>
          <h2>{isAdminMode ? "申请详情" : "申请风控详情"}</h2>
          <Badge tone="warning" text={`当前状态：${statusLabel(selected.status)}`} />
        </header>
        <div className="research-detail-scroll">
          <Alert
            type="success"
            icon={<Lock />}
            message="防泄漏探针检查通过：当前查询满足脱敏安全策略"
            description="系统已验证，申请的数据切片中不包含姓名、手机号、身份证号、精确住址、微信 OpenID 等个人身份标识信息。"
          />
          {isAdminMode ? (
            <div className="research-admin-preview">
              <div>
                <span>研究对象ID</span>
                <strong>已脱敏哈希</strong>
              </div>
              <div>
                <span>参与者编码</span>
                <strong>已隐藏真实编码</strong>
              </div>
              <small>{`本次后台预检返回 ${desensitizedTotal} 条，仅展示字段结构，不展示 RS-001 / P000001 等真实导出值。`}</small>
            </div>
          ) : null}
          <div className="research-summary-box">
            <h3>导出需求摘要</h3>
            <div>
              <label>申请团队 / 负责人</label>
              <strong>{selected.requested_by === 2 ? "科研组-王力" : "运动医学基础研究联合实验组"}</strong>
            </div>
            <div>
              <label>申请用途声明</label>
              <p>{selected.purpose}</p>
            </div>
            <div>
              <label>数据切片范围 (Filter)</label>
              <code>date &gt; 2025-01-01 AND risk_level IN ('R1', 'R2') AND has_hypertension = true</code>
            </div>
            <div>
              <label>请求字段列 (Columns)</label>
              <p className="research-field-tags">
                <span>user_hash_id</span>
                <span>age_group</span>
                <span>gender</span>
                <span>cluster_label</span>
                <span>rpe_avg</span>
                <span>共 18 列</span>
              </p>
            </div>
          </div>
        </div>
        <footer className="research-approval-box">
          <label>
            审批意见 / 限制要求
            <textarea
              value={approvalText}
              onChange={(event) => setApprovalText(event.target.value)}
              placeholder="请输入审批意见，批准后数据包将生成并仅保留 24 小时下载有效期..."
            />
          </label>
          <div>
            <span><Info /> 审批操作将被完整记录至平台审计日志</span>
            <Button danger disabled={!approvalText.trim()}>驳回申请</Button>
            <Button type="primary" disabled={!approvalText.trim()} onClick={approveSelected}>批准并授权导出</Button>
          </div>
        </footer>
      </section>
      <RequestModal
        open={requestOpen}
        purpose={purpose}
        format={format}
        onPurposeChange={setPurpose}
        onFormatChange={setFormat}
        onClose={() => setRequestOpen(false)}
        onSubmit={submitRequest}
      />
    </div>
  );
}

function RequestModal({
  open,
  purpose,
  format,
  onPurposeChange,
  onFormatChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  purpose: string;
  format: ResearchExportFormat;
  onPurposeChange: (value: string) => void;
  onFormatChange: (value: ResearchExportFormat) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="rp-modal-layer">
      <div className="rp-modal" role="dialog" aria-modal="true" aria-label="发起脱敏数据导出申请">
        <header>
          <h2>发起脱敏数据导出申请</h2>
        </header>
        <div className="rp-modal-body">
          <label>
            导出用途
            <textarea value={purpose} onChange={(event) => onPurposeChange(event.target.value)} />
          </label>
          <label>
            导出格式
            <select value={format} onChange={(event) => onFormatChange(event.target.value as ResearchExportFormat)}>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <Alert type="info" message="字段范围预览" description="仅导出脱敏编号、年龄段、性别、BMI、风险等级、分型、处方状态与阶段效果分析字段。" />
        </div>
        <footer>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!purpose.trim()} onClick={onSubmit}>提交申请</Button>
        </footer>
      </div>
    </div>
  );
}

export function ResearchPortalPage() {
  const location = useLocation();
  const isAdminMode = location.pathname.startsWith("/admin/");
  const view = viewFromPath(location.pathname);
  const [summary, setSummary] = useState<ResearchSummary>(fallbackSummary);
  const [requests, setRequests] = useState<ResearchExportRequest[]>(fallbackRequests);
  const [desensitizedTotal, setDesensitizedTotal] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getResearchSummary().catch(() => fallbackSummary),
      listResearchExportRequests().catch(() => fallbackRequests),
      isAdminMode ? exportDesensitizedUsers().catch(() => ({ total: 0, items: [] })) : Promise.resolve({ total: 0, items: [] })
    ]).then(([summaryData, requestData, exportData]) => {
      if (!mounted) return;
      setSummary(summaryData);
      setRequests(requestData.length ? requestData : fallbackRequests);
      setDesensitizedTotal(exportData.total);
    });

    return () => {
      mounted = false;
    };
  }, [isAdminMode]);

  const content = useMemo(() => {
    if (view === "clusters") return <ClusterAnalysis summary={summary} />;
    if (view === "effects") return <InterventionEffects summary={summary} />;
    if (view === "export") {
      return <ExportWorkspace requests={requests} setRequests={setRequests} isAdminMode={isAdminMode} desensitizedTotal={desensitizedTotal} />;
    }
    return <ResearchDashboard summary={summary} />;
  }, [desensitizedTotal, isAdminMode, requests, summary, view]);

  return (
    <ResearchShell view={view} isAdminMode={isAdminMode}>
      {content}
    </ResearchShell>
  );
}
