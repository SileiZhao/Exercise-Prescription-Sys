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
  Slider,
  Space,
  Steps,
  Tag,
  Typography
} from "antd";
import { Children, useState, type ChangeEventHandler, type HTMLAttributes, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Activity,
  ArrowLeft,
  BarChart3,
  Ban,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Dumbbell,
  FileText,
  FlaskConical,
  Footprints,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Menu,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Timer,
  Users,
  Workflow
} from "lucide-react";

import type { ChartDataRow } from "./charts/BaseEChart";

type RiskLevel = "R0" | "R1" | "R2" | "R3" | string | null | undefined;
type AppRole = "user" | "expert" | "admin" | "research" | "public";

const riskMeta: Record<string, { color: string; label: string; tone: string }> = {
  R0: { color: "green", label: "R0 可自动生成基础处方", tone: "risk-r0" },
  R1: { color: "cyan", label: "R1 可生成改善处方", tone: "risk-r1" },
  R2: { color: "orange", label: "R2 专家审核中", tone: "risk-r2" },
  R3: { color: "red", label: "R3 医学评估建议", tone: "risk-r3" }
};

type NavItem = [label: string, href: string, icon: ReactNode, description?: string];
type NavSection = {
  title: string;
  items: NavItem[];
};

const navItemsByRole: Record<AppRole, NavSection[]> = {
  public: [
    {
      title: "公开入口",
      items: [
        ["登录", "/login", <ShieldAlert key="login" />, "进入角色工作台"],
        ["注册", "/register", <Users key="register" />, "创建普通用户账号"]
      ]
    }
  ],
  user: [
    {
      title: "今日执行",
      items: [
        ["通行证", "/user/dashboard", <LayoutDashboard key="dashboard" />, "先判断能否运动"],
        ["今日任务", "/user/today", <Activity key="today" />, "安全闸门与打卡"],
        ["处方", "/user/prescriptions", <FileText key="rx" />, "发布状态与版本"]
      ]
    },
    {
      title: "评估闭环",
      items: [
        ["建档", "/user/health-data", <ClipboardCheck key="profile" />, "六类数据采集"],
        ["风险", "/user/risk-result", <ShieldAlert key="risk" />, "R0-R3 判定报告"],
        ["阶段报告", "/user/phase-report", <BarChart3 key="phase" />, "复评与建议"]
      ]
    }
  ],
  expert: [
    {
      title: "审核工作",
      items: [
        ["分诊看板", "/expert/dashboard", <LayoutDashboard key="dashboard" />, "优先级工作桶"],
        ["审核队列", "/expert/reviews", <Stethoscope key="review" />, "分诊、领取与单任务处理"]
      ]
    }
  ],
  admin: [
    {
      title: "运营安全",
      items: [
        ["指挥台", "/admin/dashboard", <LayoutDashboard key="dashboard" />, "上线闸口与积压"],
        ["风险规则", "/admin/rules", <ShieldAlert key="rules" />, "规则构建与测试"],
        ["审计日志", "/admin/audit-logs", <ListChecks key="audit" />, "操作追踪"]
      ]
    },
    {
      title: "平台治理",
      items: [
        ["用户专家", "/admin/users", <Users key="users" />, "身份与机构"],
        ["模板库", "/admin/templates", <Database key="templates" />, "处方模板治理"],
        ["动作库", "/admin/exercises", <Dumbbell key="actions" />, "动作审核"],
        ["知识库", "/admin/knowledge", <BookOpen key="knowledge" />, "RAG 资料"],
        ["聚类模型", "/admin/clustering", <Workflow key="cluster" />, "模型生命周期"],
        ["科研审批", "/admin/research-export", <FlaskConical key="research-export" />, "导出申请审批"]
      ]
    }
  ],
  research: [
    {
      title: "科研视图",
      items: [
        ["总览", "/research/dashboard", <BarChart3 key="research" />, "脱敏核心指标"],
        ["分型", "/research/cluster-analysis", <Workflow key="cluster" />, "聚类与风险叠加"],
        ["干预", "/research/intervention-effects", <Activity key="effects" />, "效果趋势"],
        ["导出", "/research/export-jobs", <FileText key="export" />, "申请与下载"]
      ]
    }
  ]
};

export const designTokens = {
  colors: {
    shellBg: "#eef3f7",
    shellBgStrong: "#dfe9f0",
    surface: "#ffffff",
    surfaceMuted: "#f7fafc",
    line: "#d8e2ea",
    primary: "#145c72",
    action: "#1d6fd8",
    medicalTeal: "#0f766e",
    ink: "#132235",
    muted: "#5f7186",
    risk: {
      R0: "#228b4e",
      R1: "#087c83",
      R2: "#b76504",
      R3: "#bf3030"
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

export const antdTheme = {
  token: {
    colorPrimary: designTokens.colors.action,
    colorInfo: designTokens.colors.action,
    colorSuccess: designTokens.colors.risk.R0,
    colorWarning: designTokens.colors.risk.R2,
    colorError: designTokens.colors.risk.R3,
    colorText: designTokens.colors.ink,
    colorTextSecondary: designTokens.colors.muted,
    colorBgLayout: designTokens.colors.shellBg,
    colorBgContainer: designTokens.colors.surface,
    colorBorder: designTokens.colors.line,
    borderRadius: 8,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  components: {
    Alert: {
      borderRadiusLG: 8
    },
    Button: {
      borderRadius: 7,
      controlHeight: 44
    },
    Card: {
      borderRadiusLG: 8,
      headerBg: designTokens.colors.surface
    },
    Form: {
      labelColor: designTokens.colors.ink,
      itemMarginBottom: 16
    },
    Table: {
      borderColor: designTokens.colors.line,
      cellPaddingBlock: 10,
      cellPaddingInline: 12,
      headerBg: designTokens.colors.surfaceMuted
    }
  }
};

const routePageLabels: Record<string, string> = {
  "/": "角色控制台入口",
  "/login": "登录",
  "/register": "注册",
  "/auth/change-password": "首次登录修改密码",
  "/user/dashboard": "今日通行证",
  "/user/onboarding": "用户建档",
  "/user/profile": "用户建档",
  "/user/health-data": "用户建档",
  "/user/phenotype": "风险分型",
  "/user/risk-result": "风险分型",
  "/user/prescriptions": "处方发布面板",
  "/user/today": "运动前安全闸门",
  "/user/feedback": "运动反馈",
  "/user/phase-report": "阶段报告",
  "/user/follow-up-report": "阶段报告",
  "/expert/dashboard": "专家分诊队列",
  "/expert/reviews": "专家审核队列",
  "/admin/dashboard": "运营指挥台",
  "/admin/templates": "模板库治理",
  "/admin/exercises": "动作库治理",
  "/admin/knowledge": "知识库治理",
  "/admin/rules": "风险规则构建器",
  "/admin/clusters": "聚类模型生命周期",
  "/admin/clustering": "聚类模型生命周期",
  "/admin/users": "身份治理台",
  "/admin/audit-logs": "审计日志",
  "/admin/research-export": "科研导出审批",
  "/research/export": "科研脱敏导出",
  "/research/dashboard": "科研总览",
  "/research/cluster-analysis": "科研分型分析",
  "/research/intervention-effects": "科研干预效果",
  "/research/export-jobs": "科研导出任务"
};

const roleTaskCopy: Record<AppRole, string> = {
  public: "选择角色入口或登录已有账号",
  user: "先确认今日是否可运动，再进入处方和反馈",
  expert: "优先处理高风险、异常反馈和超时审核",
  admin: "先看上线阻断，再处理积压和治理任务",
  research: "只查看脱敏聚合数据和本人导出任务"
};

const roleReturnRoutes: Record<AppRole, { href: string; label: string }> = {
  public: { href: "/", label: "返回入口" },
  user: { href: "/user/dashboard", label: "返回今日通行证" },
  expert: { href: "/expert/reviews", label: "返回审核队列" },
  admin: { href: "/admin/dashboard", label: "返回运营指挥台" },
  research: { href: "/research/dashboard", label: "返回科研总览" }
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function currentUserName() {
  const stored = localStorage.getItem("current_user_name") || localStorage.getItem("current_user_email") || "当前账号";
  return sanitizeDisplayText(stored);
}

function currentOrganizationName() {
  return localStorage.getItem("current_organization_name") || "运动健康干预中心";
}

export function AppShell({
  role,
  title,
  children,
  subtitle,
  actions,
  statusItems
}: {
  role: AppRole;
  title: string;
  children: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  statusItems?: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  return (
    <Layout className={`product-shell product-shell-${role}`}>
      <RoleSidebar role={role} />
      <Layout className={`product-main product-main-${role}`}>
        <Layout.Header className="product-header">
          {role !== "public" ? (
            <Button
              aria-label="打开角色导航"
              className="mobile-nav-button"
              icon={<Menu />}
              onClick={() => setMobileNavOpen(true)}
            />
          ) : null}
          {role !== "public" && locationNeedsBack(role, location.pathname) ? (
            <Link to={roleReturnRoutes[role].href} className="mobile-back-link" aria-label={roleReturnRoutes[role].label}>
              <ArrowLeft aria-hidden="true" />
              <span>{roleReturnRoutes[role].label}</span>
            </Link>
          ) : null}
          <PageHeader role={role} title={title} subtitle={subtitle} actions={actions} statusItems={statusItems} />
        </Layout.Header>
        <Layout.Content className={`app-content product-content product-content-${role}`}>
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

function locationNeedsBack(role: AppRole, pathname: string) {
  if (role === "public") {
    return false;
  }
  const home = roleReturnRoutes[role].href;
  return Boolean(pathname && pathname !== home);
}

export function RoleSidebar({ role }: { role: AppRole }) {
  const roleLabel: Record<AppRole, string> = {
    public: "公开入口",
    user: "用户端",
    expert: "专家端",
    admin: "管理端",
    research: "科研端"
  };
  const roleInitial: Record<AppRole, string> = {
    public: "访",
    user: "用",
    expert: "专",
    admin: "管",
    research: "研"
  };
  return (
    <Layout.Sider className="role-sidebar" breakpoint="lg" collapsedWidth={0} width={216}>
      <div className="role-brand-block">
        <span className="role-brand-mark" aria-hidden="true">启</span>
        <div className="role-brand-copy">
          <Typography.Title level={5} className="role-brand">
            启衡
          </Typography.Title>
          <Typography.Text className="role-brand-subtitle">运动处方与健康干预系统</Typography.Text>
        </div>
      </div>
      <RoleNavLinks role={role} />
      {role !== "public" ? (
        <div className="role-sidebar-footer">
          <div className="role-account">
            <span className="role-account-avatar" aria-hidden="true">{roleInitial[role]}</span>
            <span className="role-account-copy">
              <strong>{currentUserName()}</strong>
              <small>{roleLabel[role]} · {currentOrganizationName()}</small>
            </span>
          </div>
          <div className="role-safety-note">
            <ShieldCheck aria-hidden="true" />
            <span>胸痛、晕厥、严重气短等信号出现时立即停止并就医。</span>
          </div>
        </div>
      ) : null}
    </Layout.Sider>
  );
}

function RoleNavLinks({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  const location = useLocation();
  const sections = navItemsByRole[role];
  const links = sections.flatMap((section) => section.items);
  const locationKey = `${location.pathname}${location.search}`;
  const querySpecificActiveHref = links.find(([, href]) => href.includes("?") && href === locationKey)?.[1];

  return (
    <nav className="role-nav" aria-label="角色导航">
      {sections.map((section) => (
        <div className="role-nav-section" key={section.title}>
          <span className="role-nav-section-title">{section.title}</span>
          {section.items.map(([label, href, icon, description]) => {
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
                <span className="role-nav-copy">
                  <span>{label}</span>
                  {description ? <small>{description}</small> : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function PageHeader({
  role = "public",
  title,
  subtitle,
  actions,
  statusItems
}: {
  role?: AppRole;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  statusItems?: ReactNode;
}) {
  const location = useLocation();
  const roleLabel: Record<AppRole, string> = {
    public: "公开入口",
    user: "用户端",
    expert: "专家端",
    admin: "管理端",
    research: "科研端"
  };
  const pageLabel = routePageLabels[location.pathname] ?? title;
  return (
    <div className="page-header">
      <div>
        <nav className="breadcrumb-trail" aria-label="当前位置">
          <span>{roleLabel[role]}</span>
          <span aria-hidden="true">/</span>
          <span title={pageLabel}>{pageLabel}</span>
        </nav>
        <Typography.Title level={3} className="app-title">
          {title}
        </Typography.Title>
        <div className="page-task-line">
          <Typography.Text type="secondary">{subtitle ?? roleTaskCopy[role]}</Typography.Text>
        </div>
      </div>
      <Space wrap className="workspace-meta">
        {role !== "public" ? (
          <>
            <Tag className="workspace-role-tag">{roleLabel[role]}</Tag>
            <Typography.Text>{currentOrganizationName()}</Typography.Text>
            <Typography.Text type="secondary">{currentUserName()}</Typography.Text>
          </>
        ) : null}
        {statusItems ? <Space wrap className="workspace-status-items">{statusItems}</Space> : null}
        {actions ? <Space wrap>{actions}</Space> : null}
      </Space>
    </div>
  );
}

export function ClinicalStatusBadge({
  type,
  value,
  label
}: {
  type: "risk" | "review" | "exercise" | "readiness" | "export";
  value?: string | boolean | null;
  label?: string;
}) {
  const rawValue = typeof value === "boolean" ? (value ? "ready" : "blocked") : String(value ?? "unknown");
  const normalized = rawValue.toUpperCase();
  const className = `clinical-status clinical-status-${type} clinical-status-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const fallbackLabel = label ?? formatStatusLabel(normalized, type);
  return <span className={className}>{fallbackLabel}</span>;
}

export function formatStatusLabel(
  value?: string | boolean | null,
  type?: "risk" | "review" | "exercise" | "readiness" | "export" | "general"
) {
  const rawValue = typeof value === "boolean" ? (value ? "ready" : "blocked") : String(value ?? "unknown");
  const normalized = rawValue.toUpperCase();
  return statusLabel(type ?? "general", normalized);
}

export function sanitizeDisplayText(
  value?: unknown,
  type: "risk" | "review" | "exercise" | "readiness" | "export" | "general" = "general"
) {
  if (value === null || value === undefined) {
    return "";
  }
  let text = typeof value === "string" ? value : String(value);
  if (!text) {
    return text;
  }
  if (/demo[-_.@]/i.test(text)) {
    text = text.replace(/demo[-_.a-z0-9+]+@[a-z0-9.-]+/gi, "演示账号");
    text = text.replace(/\bdemo[-_.a-z0-9]+/gi, "演示样本");
  }
  text = text.replace(/\bseed[-_a-z0-9]*\b/gi, "规则库来源");

  const codeLabels: Record<string, string> = {
    PENDING_REVIEW: statusLabel(type, "PENDING_REVIEW"),
    IN_REVIEW: statusLabel(type, "IN_REVIEW"),
    NEEDS_INFO: statusLabel(type, "NEEDS_INFO"),
    APPROVED: statusLabel(type, "APPROVED"),
    PUBLISHED: statusLabel(type, "PUBLISHED"),
    REJECTED: statusLabel(type, "REJECTED"),
    REFERRED: statusLabel(type, "REFERRED"),
    EXPERT_APPROVED: statusLabel(type, "EXPERT_APPROVED"),
    EXPERT_REVIEW_DRAFT: statusLabel(type, "EXPERT_REVIEW_DRAFT"),
    DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW: statusLabel(type, "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW"),
    ACTIVE: statusLabel(type, "ACTIVE"),
    ARCHIVED: statusLabel(type, "ARCHIVED"),
    DISABLED: statusLabel(type, "DISABLED"),
    DRAFT: statusLabel(type, "DRAFT"),
    INDEX_FAILED: statusLabel(type, "INDEX_FAILED"),
    TRAINING: statusLabel(type, "TRAINING"),
    TRAINED: statusLabel(type, "TRAINED"),
    READY: statusLabel(type, "READY"),
    DEGRADED: statusLabel(type, "DEGRADED"),
    BLOCKED: statusLabel(type, "BLOCKED"),
    PENDING: statusLabel(type, "PENDING"),
    EXPIRED: statusLabel(type, "EXPIRED"),
    DOWNLOADED: statusLabel(type, "DOWNLOADED")
  };

  Object.entries(codeLabels).forEach(([code, label]) => {
    text = text.replace(new RegExp(`\\b${code}\\b`, "g"), label);
  });
  return text;
}

export function statusTagColor(value?: string | boolean | null) {
  const normalized = String(value ?? "unknown").toUpperCase();
  if (["R3", "RED", "REJECTED", "REFERRED", "BLOCKED", "INDEX_FAILED", "DISABLED"].includes(normalized)) {
    return "red";
  }
  if (
    [
      "R2",
      "YELLOW",
      "PENDING",
      "PENDING_REVIEW",
      "IN_REVIEW",
      "EXPERT_REVIEW_DRAFT",
      "DRAFT",
      "TRAINING",
      "DEGRADED"
    ].includes(normalized)
  ) {
    return "orange";
  }
  if (["R0", "R1", "GREEN", "APPROVED", "PUBLISHED", "ACTIVE", "TRAINED", "READY", "CONFIRMED"].includes(normalized)) {
    return "green";
  }
  if (["ARCHIVED", "DOWNLOADED", "EXPIRED"].includes(normalized)) {
    return "default";
  }
  return "blue";
}

function statusLabel(type: "risk" | "review" | "exercise" | "readiness" | "export" | "general", value: string) {
  if (type === "risk") {
    return riskMeta[value]?.label ?? (value === "UNKNOWN" ? "未评估" : value);
  }
  const labels: Record<string, string> = {
    PENDING_REVIEW: "待专家审核",
    IN_REVIEW: "审核中",
    NEEDS_INFO: "待补充资料",
    APPROVED: "已批准",
    PUBLISHED: "已发布",
    REJECTED: "已驳回",
    REFERRED: "已转介",
    PAUSED: "已暂停",
    EXPERT_APPROVED: "专家已批准",
    EXPERT_REVIEW_DRAFT: "专家草稿",
    EXPERT_CONFIRMED: "专家已确认",
    DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW: "待法务与专家确认",
    CONFIRMED: "已确认",
    ACTIVE: "已启用",
    ARCHIVED: "已归档",
    DISABLED: "已停用",
    DRAFT: "草稿",
    INDEX_FAILED: "索引失败",
    TRAINING: "训练中",
    TRAINED: "已训练",
    RED: "红色阻断",
    YELLOW: "黄色谨慎",
    GREEN: "绿色可行",
    READY: "就绪",
    DEGRADED: "降级",
    BLOCKED: "阻断",
    TRUE: "可运动",
    FALSE: "不可运动",
    PENDING: "待审批",
    EXPIRED: "已过期",
    DOWNLOADED: "已下载",
    UNKNOWN: "未加载"
  };
  return labels[value] ?? value;
}

export function DecisionBanner({
  tone = "info",
  title,
  description,
  actions,
  meta
}: {
  tone?: "safe" | "info" | "warning" | "danger";
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  const icon = tone === "safe" ? <CheckCircle2 /> : tone === "danger" ? <ShieldAlert /> : tone === "warning" ? <AlertTriangle /> : <ShieldCheck />;
  return (
    <section className={`decision-banner decision-${tone}`}>
      <div className="decision-icon" aria-hidden="true">{icon}</div>
      <div className="decision-content">
        {meta ? <div className="decision-meta">{meta}</div> : null}
        <Typography.Title level={3}>{title}</Typography.Title>
        <Typography.Paragraph>{description}</Typography.Paragraph>
      </div>
      {actions ? <div className="decision-actions">{actions}</div> : null}
    </section>
  );
}

export function StatusTile({
  label,
  value,
  detail,
  tone = "neutral",
  icon
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "safe" | "info" | "warning" | "danger";
  icon?: ReactNode;
}) {
  return (
    <div className={`status-tile status-tile-${tone}`}>
      {icon ? <span className="status-tile-icon">{icon}</span> : null}
      <div>
        <span className="status-tile-label">{label}</span>
        <strong className="status-tile-value">{value}</strong>
        {detail ? <span className="status-tile-detail">{detail}</span> : null}
      </div>
    </div>
  );
}

export function WorkbenchSection({
  title,
  description,
  actions,
  primaryAction,
  secondaryActions,
  children,
  className = ""
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workbench-section ${className}`}>
      <div className="workbench-section-head">
        <div>
          <Typography.Title level={4}>{title}</Typography.Title>
          {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
        </div>
        {primaryAction || secondaryActions || actions ? (
          <ActionBar primary={primaryAction} secondary={secondaryActions ?? actions} />
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function TaskLayout({
  main,
  aside,
  className = ""
}: {
  main: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`task-layout ${className}`}>
      <main className="task-layout-main">{main}</main>
      {aside ? <aside className="task-layout-aside">{aside}</aside> : null}
    </div>
  );
}

export function ClinicalSummaryStrip({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={`clinical-summary-strip ${className}`} {...rest}>{Children.toArray(children).slice(0, 3)}</div>;
}

export function DataWorkbench({
  filters,
  main,
  detail,
  className = ""
}: {
  filters?: ReactNode;
  main: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`data-workbench ${className}`} aria-label="数据工作台">
      {filters ? <div className="data-workbench-filterbar">{filters}</div> : null}
      <div className="data-workbench-body">
        <div className="data-workbench-main">{main}</div>
        {detail ? <aside className="data-workbench-detail">{detail}</aside> : null}
      </div>
    </section>
  );
}

export function EvidencePanel({
  title = "规则与证据",
  children,
  className = ""
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`evidence-panel ${className}`}>
      <Typography.Text strong>{title}</Typography.Text>
      <div className="evidence-panel-body">{children}</div>
    </section>
  );
}

export function FormDrawer({
  title,
  open,
  onClose,
  children,
  actions,
  width = 520,
  className = ""
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <Drawer
      title={title}
      width={width}
      open={open}
      onClose={onClose}
      destroyOnClose
      className={`task-drawer ${className}`}
    >
      <div className="form-drawer-content">
        {children}
        {actions ? <div className="drawer-sticky-actions">{actions}</div> : null}
      </div>
    </Drawer>
  );
}

export function ActionBar({
  primary,
  secondary,
  danger,
  more,
  className = ""
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  danger?: ReactNode;
  more?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`action-bar ${className}`}>
      {secondary ? <div className="action-bar-secondary">{secondary}</div> : null}
      {danger ? <div className="action-bar-danger">{danger}</div> : null}
      {more ? <div className="action-bar-more">{more}</div> : null}
      {primary ? <div className="action-bar-primary">{primary}</div> : null}
    </div>
  );
}

export function DataTableSummary({
  title,
  description,
  meta,
  action
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="data-table-summary">
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        {description ? <Typography.Paragraph>{description}</Typography.Paragraph> : null}
        {meta ? <div className="data-table-summary-meta">{meta}</div> : null}
      </div>
      {action ? <div className="data-table-summary-action">{action}</div> : null}
    </div>
  );
}

export function DataNote({
  title,
  description,
  action
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="data-note">
      <Typography.Text strong>{title}</Typography.Text>
      <Typography.Paragraph>{description}</Typography.Paragraph>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export type ProcessStepItem = {
  title: string;
  description: ReactNode;
  meta?: ReactNode;
  status?: "done" | "active" | "pending" | "blocked";
};

export function ProcessRail({
  title,
  description,
  steps,
  className = ""
}: {
  title: string;
  description?: ReactNode;
  steps: ProcessStepItem[];
  className?: string;
}) {
  return (
    <section className={`process-rail ${className}`}>
      <div className="process-rail-head">
        <Typography.Text strong>{title}</Typography.Text>
        {description ? <Typography.Paragraph>{description}</Typography.Paragraph> : null}
      </div>
      <ol className="process-step-list">
        {steps.map((item, index) => (
          <li key={`${item.title}-${index}`} className={`process-step process-step-${item.status ?? "pending"}`}>
            <span className="process-step-marker">{index + 1}</span>
            <div>
              <div className="process-step-title">
                <Typography.Text strong>{item.title}</Typography.Text>
                {item.meta ? <span className="process-step-meta">{item.meta}</span> : null}
              </div>
              <Typography.Paragraph>{item.description}</Typography.Paragraph>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ForbiddenActionsPanel({
  title = "当前不能做什么",
  items,
  tone = "warning"
}: {
  title?: string;
  items: string[];
  tone?: "warning" | "danger";
}) {
  return (
    <section className={`forbidden-actions-panel forbidden-actions-${tone}`}>
      <Typography.Text strong>{title}</Typography.Text>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export type VersionTimelineItem = {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  active?: boolean;
};

export function VersionTimeline({
  title = "版本时间线",
  items
}: {
  title?: string;
  items: VersionTimelineItem[];
}) {
  return (
    <section className="version-timeline-panel">
      <Typography.Text strong>{title}</Typography.Text>
      {items.length ? (
        <ol className="version-timeline">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`} className={item.active ? "is-active" : undefined}>
              <span className="version-dot" aria-hidden="true" />
              <div>
                <div className="version-title-row">
                  <Typography.Text strong>{item.title}</Typography.Text>
                  {item.status ? <span>{item.status}</span> : null}
                </div>
                {item.description ? <Typography.Paragraph>{item.description}</Typography.Paragraph> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Typography.Paragraph type="secondary">暂无版本记录</Typography.Paragraph>
      )}
    </section>
  );
}

export function MotionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = prefersReducedMotion();
  return (
    <motion.section
      className={`motion-panel motion-card ${className}`}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      data-motion={reduced ? "reduced" : "standard"}
    >
      {children}
    </motion.section>
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

export function RiskHeroBadge({ level, actionLabel }: { level: RiskLevel; actionLabel?: ReactNode }) {
  const risk = String(level ?? "未评估");
  const meta = riskMeta[risk] ?? { color: "default", label: risk, tone: "risk-unknown" };
  const copyByRisk: Record<string, { title: string; description: string; gate: string }> = {
    R0: {
      title: "可以开始低风险训练",
      description: "按处方逐步执行，运动前仍需完成安全自检。",
      gate: "训练入口开放"
    },
    R1: {
      title: "可以开始改善型训练",
      description: "保持中低强度，关注疲劳、疼痛和血压反馈。",
      gate: "训练入口开放"
    },
    R2: {
      title: "等待专家审核",
      description: "审核发布前不展示训练动作、强度和进阶计划。",
      gate: "训练入口锁定"
    },
    R3: {
      title: "暂停训练，建议医学评估",
      description: "当前仅显示安全提醒和医学评估建议，不生成运动计划。",
      gate: "训练入口阻断"
    }
  };
  const copy = copyByRisk[risk] ?? {
    title: "完成评估后生成安全边界",
    description: "系统会先判定 R0-R3，再决定是否展示处方。",
    gate: "待评估"
  };

  return (
    <section className={`risk-hero-badge ${meta.tone}`}>
      <div className="risk-hero-mark" aria-label={`当前风险等级 ${risk}`}>
        <span>{risk}</span>
      </div>
      <div className="risk-hero-copy">
        <span className="risk-hero-gate">{copy.gate}</span>
        <Typography.Title level={3}>{copy.title}</Typography.Title>
        <Typography.Paragraph>{copy.description}</Typography.Paragraph>
        {actionLabel ? <div className="risk-hero-action">{actionLabel}</div> : null}
      </div>
    </section>
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

function valueToText(value: unknown, fallback = "-") {
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

function valueToList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[，,；;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value === null || value === undefined || value === "") {
    return [];
  }
  return [String(value)];
}

export function FITTVPCard({
  fitt,
  riskLevel,
  precautions = [],
  contraindications = []
}: {
  fitt?: Record<string, unknown> | null;
  riskLevel?: RiskLevel;
  precautions?: string[];
  contraindications?: string[];
}) {
  if (riskLevel === "R3" || !fitt) {
    return <Alert type="error" showIcon message="当前不展示训练计划，仅显示安全提醒和医学评估建议。" />;
  }
  const metrics = [
    { key: "frequency", label: "频率", value: valueToText(fitt.frequency), icon: <CalendarDays /> },
    { key: "intensity", label: "强度", value: valueToText(fitt.intensity), icon: <Gauge /> },
    { key: "time", label: "时间", value: valueToText(fitt.time), icon: <Timer /> }
  ];
  const exerciseTypes = valueToList(fitt.type);
  const supportTags = [
    ...valueToList(fitt.volume).map((item) => ({ label: item, tone: "neutral" })),
    ...valueToList(fitt.progression).map((item) => ({ label: item, tone: "info" })),
    ...precautions.map((item) => ({ label: item, tone: "safe" })),
    ...contraindications.map((item) => ({ label: item, tone: "danger" }))
  ].filter((item) => item.label && item.label.toLowerCase() !== "seed");
  return (
    <Card title="FITT-VP 处方结构" size="small" className="fitt-vp-card">
      <div className="fitt-metric-grid">
        {metrics.map((metric) => (
          <div className="fitt-metric-card" key={metric.key}>
            <span className="fitt-metric-icon" aria-hidden="true">
              {metric.icon}
            </span>
            <span className="fitt-metric-label">{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="fitt-tag-section">
        <div>
          <span className="fitt-tag-label">
            <Footprints aria-hidden="true" />
            运动类型
          </span>
          <div className="fitt-tag-list">
            {(exerciseTypes.length ? exerciseTypes : ["待专家确认"]).map((item) => (
              <span className="fitt-chip fitt-chip-type" key={item}>{item}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="fitt-tag-label">
            <Ban aria-hidden="true" />
            注意边界
          </span>
          <div className="fitt-tag-list">
            {(supportTags.length ? supportTags : [{ label: "按 RPE 和停止信号监测", tone: "neutral" }]).map((item) => (
              <span className={`fitt-chip fitt-chip-${item.tone}`} key={`${item.tone}-${item.label}`}>{item.label}</span>
            ))}
          </div>
        </div>
      </div>
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
  return <div className="review-workbench">{children}</div>;
}

export function RuleHitCard({ rule }: { rule: Record<string, unknown> }) {
  return <Alert type="warning" showIcon message={sanitizeDisplayText(rule.code ?? "规则命中")} description={sanitizeDisplayText(rule.message ?? "")} />;
}

export function EvidenceCard({ evidence }: { evidence: Record<string, unknown> }) {
  return <div className="evidence-card">{sanitizeDisplayText(evidence.document_title ?? evidence.source ?? "证据来源")}</div>;
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
  empty = false,
  unit,
  insight,
  threshold,
  emptyReason,
  action,
  dataRows,
  dataSummary
}: {
  title: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  unit?: string;
  insight?: ReactNode;
  threshold?: ReactNode;
  emptyReason?: ReactNode;
  action?: ReactNode;
  dataRows?: ChartDataRow[];
  dataSummary?: string;
}) {
  return (
    <section className="chart-panel chart-card" aria-label={title}>
      <div className="chart-panel-head">
        <Typography.Title level={5}>{title}</Typography.Title>
      </div>
      <div className="chart-panel-body">
        {unit || insight || threshold ? (
          <div className="chart-card-meta">
            {unit ? <Typography.Text className="chart-card-unit">单位：{unit}</Typography.Text> : null}
            {insight ? <Typography.Paragraph>{insight}</Typography.Paragraph> : null}
            {threshold ? <Typography.Text type="secondary">{threshold}</Typography.Text> : null}
          </div>
        ) : null}
        {loading ? (
          <div role="status" className="chart-state chart-loading">图表加载中</div>
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : empty ? (
          <div className="chart-state chart-empty">
            <Empty description="暂无图表数据" />
            {emptyReason ? <Typography.Paragraph className="chart-state-detail">{emptyReason}</Typography.Paragraph> : null}
            {action ? <div className="chart-state-action">{action}</div> : null}
          </div>
        ) : (
          children
        )}
        {dataRows?.length ? <ChartDataFallback rows={dataRows} summary={dataSummary ?? `${title} 数据表`} /> : null}
      </div>
    </section>
  );
}

export function ChartPanel(props: Parameters<typeof ChartCard>[0]) {
  return <ChartCard {...props} />;
}

function ChartDataFallback({ rows, summary }: { rows: ChartDataRow[]; summary: string }) {
  return (
    <details className="chart-data-fallback">
      <summary>查看数据</summary>
      <div className="chart-data-table-wrap">
        <table className="chart-data-table">
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">项目</th>
              {rows[0]?.values.map((item) => (
                <th scope="col" key={item.label}>{item.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((item) => (
                  <td key={`${row.label}-${item.label}`}>{item.value ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title?: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Empty description={title ?? description} />
      {title ? <Typography.Paragraph>{description}</Typography.Paragraph> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function UnitTextInput({ unit }: { unit: string }) {
  return <Input addonAfter={unit} />;
}
