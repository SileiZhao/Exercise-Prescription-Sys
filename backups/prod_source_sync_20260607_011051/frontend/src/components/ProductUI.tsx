import { motion } from "framer-motion";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Layout,
  List,
  Progress,
  Row,
  Slider,
  Space,
  Steps,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useState, type ChangeEventHandler, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Database,
  Dumbbell,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Menu,
  ShieldAlert,
  Stethoscope,
  Users,
  Workflow
} from "lucide-react";

type RiskLevel = "R0" | "R1" | "R2" | "R3" | string | null | undefined;
type AppRole = "user" | "expert" | "admin" | "research" | "public";

const riskMeta: Record<string, { color: string; label: string; tone: string }> = {
  R0: { color: "green", label: "R0 可自动生成基础处方", tone: "risk-r0" },
  R1: { color: "cyan", label: "R1 可生成改善处方", tone: "risk-r1" },
  R2: { color: "orange", label: "R2 专家审核中", tone: "risk-r2" },
  R3: { color: "red", label: "R3 医学评估建议", tone: "risk-r3" }
};

type NavItem = [label: string, href: string, icon: ReactNode];

const navItemsByRole: Record<AppRole, NavItem[]> = {
  public: [
    ["登录", "/login", <ShieldAlert key="login" />],
    ["注册", "/register", <Users key="register" />]
  ],
  user: [
    ["看板", "/user/dashboard", <LayoutDashboard key="dashboard" />],
    ["建档", "/user/health-data", <ClipboardCheck key="profile" />],
    ["风险", "/user/risk-result", <ShieldAlert key="risk" />],
    ["处方", "/user/prescriptions", <FileText key="rx" />],
    ["今日", "/user/today", <Activity key="today" />],
    ["反馈", "/user/feedback", <ListChecks key="feedback" />]
  ],
  expert: [
    ["看板", "/expert/dashboard", <LayoutDashboard key="dashboard" />],
    ["审核", "/expert/reviews", <Stethoscope key="review" />],
    ["证据", "/expert/reviews?panel=evidence", <BookOpen key="evidence" />]
  ],
  admin: [
    ["看板", "/admin/dashboard", <LayoutDashboard key="dashboard" />],
    ["用户", "/admin/users", <Users key="users" />],
    ["规则", "/admin/rules", <ShieldAlert key="rules" />],
    ["模板", "/admin/templates", <Database key="templates" />],
    ["动作", "/admin/exercises", <Dumbbell key="actions" />],
    ["知识库", "/admin/knowledge", <BookOpen key="knowledge" />],
    ["聚类", "/admin/clustering", <Workflow key="cluster" />],
    ["科研导出", "/admin/research-export", <FlaskConical key="research-export" />],
    ["审计", "/admin/audit-logs", <ListChecks key="audit" />]
  ],
  research: [
    ["科研", "/research/dashboard", <BarChart3 key="research" />],
    ["分型", "/research/cluster-analysis", <Workflow key="cluster" />],
    ["干预", "/research/intervention-effects", <Activity key="effects" />],
    ["导出", "/research/export-jobs", <FileText key="export" />]
  ]
};

export const designTokens = {
  colors: {
    shellBg: "#f3f7fb",
    surface: "#ffffff",
    primary: "#0b3f5c",
    action: "#1677ff",
    medicalTeal: "#0f766e",
    risk: {
      R0: "#2f9e44",
      R1: "#0f766e",
      R2: "#d97706",
      R3: "#d9363e"
    }
  },
  radius: {
    card: 8,
    panel: 10
  },
  shadow: {
    card: "0 10px 28px rgba(24, 44, 74, 0.06)"
  }
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function currentUserName() {
  return localStorage.getItem("current_user_name") || localStorage.getItem("current_user_email") || "演示账号";
}

function currentOrganizationName() {
  return localStorage.getItem("current_organization_name") || "河南体育学院运动促进健康示范中心";
}

export function AppShell({
  role,
  title,
  children,
  subtitle,
  actions
}: {
  role: AppRole;
  title: string;
  children: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <Layout className="product-shell">
      <RoleSidebar role={role} />
      <Layout className="product-main">
        <Layout.Header className="product-header">
          {role !== "public" ? (
            <Button
              aria-label="打开角色导航"
              className="mobile-nav-button"
              icon={<Menu />}
              onClick={() => setMobileNavOpen(true)}
            />
          ) : null}
          <PageHeader role={role} title={title} subtitle={subtitle} actions={actions} />
        </Layout.Header>
        <Layout.Content className="app-content product-content">
          {role !== "public" ? <DemoDataBanner /> : null}
          {children}
        </Layout.Content>
        <Drawer
          title="角色导航"
          placement="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          className="mobile-nav-drawer"
        >
          <RoleNavLinks role={role} onNavigate={() => setMobileNavOpen(false)} />
        </Drawer>
      </Layout>
    </Layout>
  );
}

export function RoleSidebar({ role }: { role: AppRole }) {
  return (
    <Layout.Sider className="role-sidebar" breakpoint="lg" collapsedWidth={0} width={188}>
      <Typography.Title level={5} className="role-brand">
        AI 运动处方
      </Typography.Title>
      <RoleNavLinks role={role} />
    </Layout.Sider>
  );
}

function RoleNavLinks({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  const location = useLocation();
  const links = navItemsByRole[role];
  const locationKey = `${location.pathname}${location.search}`;
  const querySpecificActiveHref = links.find(([, href]) => href.includes("?") && href === locationKey)?.[1];

  return (
    <nav className="role-nav" aria-label="角色导航">
      {links.map(([label, href, icon]) => {
        const hrefPath = href.split("?")[0];
        const isActive = querySpecificActiveHref
          ? href === querySpecificActiveHref
          : location.pathname === hrefPath || location.pathname.startsWith(`${hrefPath}/`);
        return (
          <Link
            to={href}
            key={href}
            className={`role-nav-item${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
          >
            <span className="role-nav-icon">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  role = "public",
  title,
  subtitle,
  actions
}: {
  role?: AppRole;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const roleLabel: Record<AppRole, string> = {
    public: "公开入口",
    user: "用户端",
    expert: "专家端",
    admin: "管理端",
    research: "科研端"
  };
  return (
    <div className="page-header">
      <div>
        <nav className="breadcrumb-trail" aria-label="当前位置">
          <span>{roleLabel[role]}</span>
          <span aria-hidden="true">/</span>
          <span title={title}>当前页</span>
        </nav>
        <Typography.Title level={3} className="app-title">
          {title}
        </Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      <Space wrap className="workspace-meta">
        {role !== "public" ? (
          <>
            <Tag color="blue">{roleLabel[role]}</Tag>
            <Typography.Text>{currentOrganizationName()}</Typography.Text>
            <Typography.Text type="secondary">{currentUserName()}</Typography.Text>
          </>
        ) : null}
        {actions ? <Space wrap>{actions}</Space> : null}
      </Space>
    </div>
  );
}

export function MotionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = prefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      data-motion={reduced ? "reduced" : "standard"}
    >
      <Card className={`motion-card ${className}`}>{children}</Card>
    </motion.div>
  );
}

export function MetricCard({
  title,
  value,
  suffix,
  icon,
  trend,
  trendLabel,
  sparkline
}: {
  title: string;
  value: string | number;
  suffix?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  sparkline?: number[];
}) {
  return (
    <MotionCard className="metric-card">
      <Space align="start">
        {icon ? <span className="metric-icon">{icon}</span> : null}
        <div>
          <Typography.Text type="secondary">{title}</Typography.Text>
          <Typography.Title level={4}>
            <AnimatedNumber value={suffix ? `${value}${suffix}` : value} />
          </Typography.Title>
          {trendLabel ? <Typography.Text className={`metric-trend trend-${trend ?? "flat"}`}>{trendLabel}</Typography.Text> : null}
          {sparkline?.length ? <Sparkline title={title} values={sparkline} /> : null}
        </div>
      </Space>
    </MotionCard>
  );
}

export function AnimatedNumber({ value }: { value: string | number }) {
  return <motion.span initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>{value}</motion.span>;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const meta = riskMeta[String(level)] ?? { color: "default", label: String(level || "未评估"), tone: "" };
  return (
    <Tag color={meta.color} className={`risk-badge ${meta.tone}`}>
      {meta.label}
    </Tag>
  );
}

export function RiskStatusPanel({ level, title }: { level: RiskLevel; title?: string }) {
  const risk = String(level ?? "未评估");
  const messageByRisk: Record<string, string> = {
    R0: "可按自动生成基础处方执行，仍需按停止信号自我监测。",
    R1: "可执行改善处方，关注体重、久坐和运动反馈变化。",
    R2: "需专家审核；审核通过后才展示训练入口，审核前不展示开始训练入口，不允许自行训练。",
    R3: "仅显示医学评估建议，不展示训练动作、强度、组数或进阶计划。"
  };
  const alertType = risk === "R3" ? "error" : risk === "R2" ? "warning" : "info";
  return (
    <Alert
      className={`risk-status-panel ${riskMeta[risk]?.tone ?? ""}`}
      type={alertType}
      showIcon
      message={title ?? "安全边界"}
      description={messageByRisk[risk] ?? "请先完成风险筛查后再查看处方路径。"}
    />
  );
}

export function DemoDataBanner() {
  const reduced = prefersReducedMotion();
  return (
    <Tooltip title="仅用于演示、培训、试点汇报和流程验证，不代表生产真实数据。">
      <Alert
        className="demo-data-banner"
        data-motion={reduced ? "reduced" : "standard"}
        type="info"
        showIcon
        message="当前为示范数据"
        description="仅用于演示、培训和试点汇报；数据带有 demo 标识，账号、处方、审核、反馈和科研导出均用于产品展示。"
      />
    </Tooltip>
  );
}

export function PageHero({
  eyebrow,
  title,
  summary,
  actions
}: {
  eyebrow?: string;
  title: string;
  summary: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-hero">
      <div>
        {eyebrow ? <Typography.Text className="page-hero-eyebrow">{eyebrow}</Typography.Text> : null}
        <Typography.Title level={3}>{title}</Typography.Title>
        <Typography.Paragraph>{summary}</Typography.Paragraph>
      </div>
      {actions ? <Space wrap>{actions}</Space> : null}
    </section>
  );
}

function Sparkline({ title, values }: { title: string; values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
      const y = 32 - ((value - min) / span) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="metric-sparkline" viewBox="0 0 100 36" aria-label={`${title} 微型趋势图`} role="img">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlowProgress({ current = 0 }: { current?: number }) {
  return (
    <Steps
      size="small"
      current={current}
      items={["用户建档", "风险筛查", "分型", "处方", "审核", "执行", "反馈", "阶段评估"].map((title) => ({ title }))}
    />
  );
}

export function UnitInput({
  unit,
  value,
  onChange,
  ...inputProps
}: {
  unit: string;
  min?: number;
  max?: number;
  value?: string | number | null;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Input
      {...inputProps}
      type="number"
      value={value ?? undefined}
      onChange={onChange}
      suffix={unit}
      className="full-width-control"
    />
  );
}

export function RpeSlider({ value }: { value?: number }) {
  return <Slider min={0} max={20} value={value} marks={{ 6: "轻", 13: "中", 17: "高" }} />;
}

export function PainScale({ value }: { value?: number }) {
  return <Progress percent={Math.min(100, (Number(value ?? 0) / 10) * 100)} strokeColor={Number(value ?? 0) >= 7 ? "#d9363e" : "#faad14"} />;
}

export function FITTVPCard({ fitt, riskLevel }: { fitt?: Record<string, unknown> | null; riskLevel?: RiskLevel }) {
  if (riskLevel === "R3" || !fitt) {
    return <Alert type="error" showIcon message="当前不展示训练计划，仅显示安全提醒和医学评估建议。" />;
  }
  const labels: Record<string, string> = {
    frequency: "频率",
    intensity: "强度",
    time: "时间",
    type: "类型",
    volume: "总量",
    progression: "进阶"
  };
  return (
    <Card title="FITT-VP 处方结构" size="small">
      <Descriptions column={1} size="small">
        {["frequency", "intensity", "time", "type", "volume", "progression"].map((key) => (
          <Descriptions.Item key={key} label={labels[key]}>
            {Array.isArray(fitt[key]) ? (fitt[key] as unknown[]).join("、") : String(fitt[key] ?? "-")}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}

export function ExerciseTaskCard({ fitt, precautions }: { fitt?: Record<string, unknown> | null; precautions?: string[] }) {
  return (
    <Card title="今日任务" size="small">
      <List
        dataSource={[
          `类型：${Array.isArray(fitt?.type) ? (fitt?.type as unknown[]).join("、") : String(fitt?.type ?? "-")}`,
          `时长：${String(fitt?.time ?? "-")}`,
          `强度：${String(fitt?.intensity ?? "-")}`,
          `注意：${precautions?.join("、") || "按 RPE 和停止信号监测"}`
        ]}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    </Card>
  );
}

export function ContraindicationList({ items }: { items?: string[] }) {
  return (
    <Alert
      type="warning"
      showIcon
      message="禁忌动作与停止运动条件"
      description={(items?.length ? items : ["胸痛、晕厥、严重气短、疼痛明显加重时立即停止运动"]).join("；")}
    />
  );
}

export function HealthDataWizard({ current = 0 }: { current?: number }) {
  return (
    <Steps
      current={current}
      items={["知情同意", "基础信息", "体质测试", "身体成分", "生化指标", "风险问卷", "提交评估"].map((title) => ({ title }))}
    />
  );
}

export function PrescriptionEditor({ children }: { children: ReactNode }) {
  return (
    <div className="prescription-editor">
      <Typography.Title level={5}>FITT-VP 结构化编辑器</Typography.Title>
      {children}
    </div>
  );
}

export function ReviewWorkbench({ children }: { children: ReactNode }) {
  return <Row gutter={[16, 16]} className="review-workbench">{children}</Row>;
}

export function RuleHitCard({ rule }: { rule: Record<string, unknown> }) {
  return <Alert type="warning" showIcon message={String(rule.code ?? "规则命中")} description={String(rule.message ?? "")} />;
}

export function EvidenceCard({ evidence }: { evidence: Record<string, unknown> }) {
  return <div className="evidence-card">{String(evidence.document_title ?? evidence.source ?? "证据来源")}</div>;
}

type EvidenceTimelineDetail = {
  label: string;
  value: ReactNode;
};

type EvidenceTimelineItem = {
  title: string;
  description?: string;
  status?: "done" | "active" | "pending";
  details?: EvidenceTimelineDetail[];
};

export function EvidenceTimeline({ items }: { items: EvidenceTimelineItem[] }) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  return (
    <ol className="evidence-timeline" aria-label="证据时间线">
      {items.map((item, index) => {
        const expanded = Boolean(expandedItems[index]);
        const hasDetails = Boolean(item.details?.length);
        return (
          <li key={`${item.title}-${index}`} className={`timeline-item timeline-${item.status ?? "pending"}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <Typography.Text strong>{item.title}</Typography.Text>
              {item.description ? <Typography.Paragraph>{item.description}</Typography.Paragraph> : null}
              {hasDetails ? (
                <>
                  <Button
                    type="link"
                    size="small"
                    className="evidence-toggle"
                    onClick={() => setExpandedItems((current) => ({ ...current, [index]: !expanded }))}
                  >
                    {expanded ? "收起完整证据链" : "展开完整证据链"}
                  </Button>
                  {expanded ? (
                    <Descriptions className="evidence-detail-grid" column={1} size="small">
                      {item.details?.map((detail) => (
                        <Descriptions.Item key={detail.label} label={detail.label}>
                          {detail.value}
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  ) : null}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AuditTrail({ items = [] }: { items?: string[] }) {
  return <List size="small" dataSource={items} locale={{ emptyText: "暂无审计留痕" }} renderItem={(item) => <List.Item>{item}</List.Item>} />;
}

export function ChartCard({
  title,
  children,
  loading = false,
  error = null,
  empty = false
}: {
  title: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
}) {
  return (
    <Card title={title} className="chart-card">
      {loading ? (
        <div role="status" className="chart-state chart-loading">图表加载中</div>
      ) : error ? (
        <Alert type="error" showIcon message={error} />
      ) : empty ? (
        <Empty description="暂无图表数据" />
      ) : (
        children
      )}
    </Card>
  );
}

export function EmptyState({ description }: { description: string }) {
  return <Empty description={description} />;
}

export function UnitTextInput({ unit }: { unit: string }) {
  return <Input addonAfter={unit} />;
}
