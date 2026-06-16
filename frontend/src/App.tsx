import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, ConfigProvider, Layout, Spin } from "antd";
import { motion } from "framer-motion";
import zhCN from "antd/locale/zh_CN";
import {
  ArrowRight,
  ClipboardCheck,
  Database,
  Dumbbell,
  FileCheck2,
  FlaskConical,
  Gauge,
  HeartPulse,
  LogIn,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  UserPlus
} from "lucide-react";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { ClinicalStatusBadge, antdTheme } from "./components/ProductUI";
import type { AuthUserRole } from "./auth/token";
import { lazyPageLoaders } from "./routeLoaders";
import "./styles.css";
import "./product-layout.css";
import "./clinical-workbench.css";
import "./user-experience.css";

const queryClient = new QueryClient();

type PageModule = Record<string, ComponentType>;

function lazyPage(loader: () => Promise<PageModule>, exportName: string) {
  return lazy(async () => {
    const pageModule = await loader();
    return { default: pageModule[exportName] };
  });
}

const AdminAuditPage = lazyPage(lazyPageLoaders.adminAudit, "AdminAuditPage");
const AdminClustersPage = lazyPage(lazyPageLoaders.adminClusters, "AdminClustersPage");
const AdminDashboardPage = lazyPage(lazyPageLoaders.adminDashboard, "AdminDashboardPage");
const AdminRulesPage = lazyPage(lazyPageLoaders.adminRules, "AdminRulesPage");
const AdminTemplatePage = lazyPage(lazyPageLoaders.adminTemplates, "AdminTemplatePage");
const AdminUsersPage = lazyPage(lazyPageLoaders.adminUsers, "AdminUsersPage");
const ChangePasswordPage = lazyPage(lazyPageLoaders.changePassword, "ChangePasswordPage");
const ExpertReviewPage = lazyPage(lazyPageLoaders.expertReview, "ExpertReviewPage");
const LoginPage = lazyPage(lazyPageLoaders.login, "LoginPage");
const OnboardingWizardPage = lazyPage(lazyPageLoaders.onboarding, "OnboardingWizardPage");
const PhenotypePage = lazyPage(lazyPageLoaders.phenotype, "PhenotypePage");
const PhaseReportPage = lazyPage(lazyPageLoaders.phaseReport, "PhaseReportPage");
const PrescriptionPage = lazyPage(lazyPageLoaders.prescription, "PrescriptionPage");
const RegisterPage = lazyPage(lazyPageLoaders.register, "RegisterPage");
const ResearchExportPage = lazyPage(lazyPageLoaders.researchExport, "ResearchExportPage");
const TodayExercisePage = lazyPage(lazyPageLoaders.todayExercise, "TodayExercisePage");
const UserDashboardPage = lazyPage(lazyPageLoaders.userDashboard, "UserDashboardPage");

const entryCards = [
  {
    title: "用户端",
    description: "建档、查看风险结论、接收处方和完成运动反馈。",
    task: "确认能否运动",
    role: "USER",
    icon: <HeartPulse />,
    path: "/user/dashboard"
  },
  {
    title: "专家端",
    description: "处理 R2 处方、异常反馈和需要人工判断的任务。",
    task: "处理审核队列",
    role: "EXPERT",
    icon: <Stethoscope />,
    path: "/expert/dashboard"
  },
  {
    title: "管理端",
    description: "管理规则、模板、知识库、用户权限和上线审计。",
    task: "检查运营闸口",
    role: "ADMIN",
    icon: <ShieldCheck />,
    path: "/admin/dashboard"
  },
  {
    title: "科研端",
    description: "查看脱敏聚合指标，提交和下载已审批的数据导出。",
    task: "查看脱敏总览",
    role: "RESEARCHER",
    icon: <Database />,
    path: "/research/dashboard"
  }
];

const roleLabelByAuthRole: Record<string, string> = {
  USER: "用户端",
  EXPERT: "专家端",
  ADMIN: "管理端",
  ORG_ADMIN: "管理端",
  RESEARCHER: "科研端"
};

const platformSignals = [
  ["R2", "专家审核", "处方动作发布前锁定"],
  ["R3", "医学转介", "系统不生成训练任务"],
  ["导出", "脱敏审批", "科研下载留痕"]
];

const safetyBoundaries = [
  ["R2", "进入专家审核", "处方发布前必须完成证据核对。"],
  ["R3", "医学评估优先", "系统只展示转介或机构复评建议。"],
  ["导出", "审批后开放", "科研数据默认脱敏并记录下载行为。"]
];

const prescriptionMetrics = [
  ["F", "3 次/周", "频率"],
  ["I", "RPE 11-13", "强度"],
  ["T", "30 分钟", "时间"],
  ["VP", "+10%/2 周", "进阶"]
];

const riskLevels = [
  ["R0", "直接可训", "低风险建档完整"],
  ["R1", "提醒执行", "需监测 RPE 与不适"],
  ["R2", "专家审核", "处方动作暂不发布"],
  ["R3", "医学转介", "阻断训练入口"]
];

const clinicalRoute = [
  {
    title: "用户建档",
    detail: "健康问卷、体适能、慢病风险",
    icon: <HeartPulse />
  },
  {
    title: "风险分层",
    detail: "规则命中 R0-R3，颜色只作辅助",
    icon: <Gauge />
  },
  {
    title: "专家审核",
    detail: "R2 处方进入审核队列",
    icon: <Stethoscope />
  },
  {
    title: "处方发布",
    detail: "FITT-VP 与禁忌动作可追溯",
    icon: <ClipboardCheck />
  },
  {
    title: "科研治理",
    detail: "聚合脱敏，审批后限时下载",
    icon: <FlaskConical />
  }
];

function HomePage() {
  const currentRole = localStorage.getItem("current_user_role");
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));
  const activeEntry = entryCards.find((item) => item.role === currentRole) ?? entryCards[0];
  const currentRoleLabel = currentRole ? roleLabelByAuthRole[currentRole] ?? currentRole : "";

  return (
    <Layout className="app-shell home-shell">
      <div className="home-background" aria-hidden="true">
        <span className="home-grid-plane" />
        <span className="home-vital-line" />
        <span className="home-vital-line home-vital-line-secondary" />
      </div>
      <header className="home-topbar">
        <Link to="/" className="home-brand-lockup" aria-label="启衡首页">
          <span className="home-brand-mark">启</span>
          <span>
            <strong>启衡运动处方平台</strong>
            <small>临床安全 · 专家审核 · 科研治理</small>
          </span>
        </Link>
        <nav className="home-top-actions" aria-label="账户操作">
          {isLoggedIn ? (
            <Link to={activeEntry.path}>
              <Button icon={<ArrowRight size={16} />}>进入当前工作台</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button icon={<LogIn size={16} />}>登录账号</Button>
            </Link>
          )}
          <Link to={isLoggedIn ? "/login" : "/register"}>
            <Button icon={isLoggedIn ? undefined : <UserPlus size={16} />}>
              {isLoggedIn ? "切换账号" : "注册用户"}
            </Button>
          </Link>
        </nav>
      </header>

      <Layout.Content className="home-content">
        <motion.main
          className="home-gateway"
          aria-label="角色控制台入口"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.section
            className="home-briefing"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="home-kicker">运动处方安全中台</div>
            <h1>启衡运动处方平台</h1>
            <p className="home-briefing-copy">
              把体征采集、R0-R3 风险判定、专家审核、FITT-VP 处方发布和科研脱敏出口收在一张可审计链路里。
            </p>
            <div className="home-briefing-actions">
              <Link to={isLoggedIn ? activeEntry.path : "/login"}>
                <Button type="primary" size="large" className="home-primary-action" icon={<LogIn size={17} />}>
                  {isLoggedIn ? `进入${activeEntry.title}` : "登录账号"}
                </Button>
              </Link>
              <Link to="/register">
                <Button size="large" className="home-secondary-action" icon={<UserPlus size={17} />}>注册用户</Button>
              </Link>
            </div>
            <div className="home-prescription-board" aria-label="运动处方主视觉">
              <div className="home-patient-card">
                <div>
                  <span>Adult · 初筛</span>
                  <strong>慢病风险复合人群</strong>
                </div>
                <HeartPulse size={24} />
              </div>
              <div className="home-prescription-vitals" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="home-risk-ladder">
                {riskLevels.map(([level, title, detail]) => (
                  <div className={`home-risk-node home-risk-${level.toLowerCase()}`} key={level}>
                    <b>{level}</b>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                ))}
              </div>
              <div className="home-prescription-sheet">
                <div className="home-sheet-title">
                  <FileCheck2 size={18} />
                  <span>处方发布单</span>
                </div>
                <div className="home-metric-strip">
                  {prescriptionMetrics.map(([label, value, detail]) => (
                    <div key={label}>
                      <b>{label}</b>
                      <strong>{value}</strong>
                      <small>{detail}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="home-review-gate">
                <ShieldAlert size={18} />
                <span>R2/R3 先过安全闸门</span>
              </div>
            </div>
            <dl className="home-signal-list" aria-label="系统边界">
              {platformSignals.map(([label, value, detail]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <strong>{value}</strong>
                    <span>{detail}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </motion.section>

          <motion.aside
            className="home-access-panel"
            aria-label="选择工作台"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.14, duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="home-access-head">
              <div>
                <span className="home-section-label">选择工作台</span>
                <h2>{isLoggedIn ? `${currentRoleLabel || activeEntry.title}已识别` : "请选择账号进入"}</h2>
              </div>
              <ClinicalStatusBadge
                type="readiness"
                value={isLoggedIn ? "ready" : "degraded"}
                label={isLoggedIn ? "已登录" : "未登录"}
              />
            </div>
            <div className="home-current-task home-map-status">
              <span>{isLoggedIn ? "当前建议入口" : "处方链路状态"}</span>
              <strong>{isLoggedIn ? activeEntry.task : "安全闸门已启用"}</strong>
            </div>
            <div className="home-route-map" aria-label="处方流转地图">
              {clinicalRoute.map((item, index) => (
                <div className="home-route-step" key={item.title}>
                  <span className="home-route-icon" aria-hidden="true">{item.icon}</span>
                  <span className="home-route-copy">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="home-route-index">{String(index + 1).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
            <div className="home-access-split">
              <div>
                <RouteIcon size={18} />
                <strong>处方执行只在安全结论后开放</strong>
              </div>
              <small>未登录时所有角色入口都会先进入机构登录；登录后按账号角色打开工作台。</small>
            </div>
            <nav className="home-role-list" aria-label="工作台列表">
              {entryCards.map((item) => {
                const isActive = currentRole === item.role;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + entryCards.indexOf(item) * 0.04, duration: 0.32 }}
                  >
                    <Link
                      to={isLoggedIn ? item.path : "/login"}
                      className={`home-role-row${isActive ? " is-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="home-role-icon" aria-hidden="true">{item.icon}</span>
                      <span className="home-role-copy">
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="home-role-action">
                        {isActive ? "进入" : item.task}
                        <ArrowRight size={14} />
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </nav>
          </motion.aside>
        </motion.main>

        <motion.section
          className="home-safety-rail"
          aria-label="安全边界"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          {safetyBoundaries.map(([label, title, detail]) => (
            <div className="home-safety-item" key={label}>
              <span>{label}</span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          ))}
          <div className="home-safety-item home-safety-item-wide">
            <span><Dumbbell size={15} /></span>
            <strong>运动动作与禁忌共管</strong>
            <small>有氧、抗阻、柔韧和平衡训练都必须带强度、进阶与停止条件。</small>
          </div>
        </motion.section>
      </Layout.Content>
    </Layout>
  );
}

function PageSuspense({ children }: { children: JSX.Element }) {
  return (
    <Suspense
      fallback={
        <div className="route-loading">
          <Spin />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function routePage(page: JSX.Element) {
  return <PageSuspense>{page}</PageSuspense>;
}

function protectedPage(page: JSX.Element, allowedRoles?: AuthUserRole[]) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <PageSuspense>{page}</PageSuspense>
    </ProtectedRoute>
  );
}

const USER_ONLY: AuthUserRole[] = ["USER"];
const EXPERT_ONLY: AuthUserRole[] = ["EXPERT"];
const ADMIN_ONLY: AuthUserRole[] = ["ADMIN", "ORG_ADMIN"];
const RESEARCH_ONLY: AuthUserRole[] = ["RESEARCHER"];

function sanitizeVisibleRuntimeText(value: string) {
  return value
    .replace(/AI\s*个性化运动处方平台/g, "启衡运动处方平台")
    .replace(/启衡运动处方系统/g, "启衡运动处方平台")
    .replace(/智能化运动处方系统/g, "启衡运动处方平台")
    .replace(/AI\s*运动处方/g, "启衡运动处方")
    .replace(/AI\s*初稿/g, "系统初稿")
    .replace(/\bAI_DRAFT\b/g, "系统初稿")
    .replace(/\[DEMO\]\s*/g, "")
    .replace(/\bseed[_-]?[a-z0-9_-]*/gi, "用户")
    .replace(/\bDEMO[_-]?/g, "")
    .replace(/\bdemo[-_]?/gi, "")
    .replace(/演示/g, "")
    .replace(/示范/g, "");
}

function useVisibleTextSanitizer() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const patchInteractiveLabels = (root: Node) => {
      const scope = root instanceof Element ? root : document;
      scope.querySelectorAll(".ant-pagination-prev .ant-pagination-item-link:not([aria-label])").forEach((node) => {
        node.setAttribute("aria-label", "上一页");
        node.setAttribute("title", "上一页");
      });
      scope.querySelectorAll(".ant-pagination-next .ant-pagination-item-link:not([aria-label])").forEach((node) => {
        node.setAttribute("aria-label", "下一页");
        node.setAttribute("title", "下一页");
      });
    };

    const sanitizeNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const nextValue = sanitizeVisibleRuntimeText(node.nodeValue);
        if (nextValue !== node.nodeValue) {
          node.nodeValue = nextValue;
        }
      }
    };

    const sanitizeTree = (root: Node) => {
      sanitizeNode(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        sanitizeNode(current);
        current = walker.nextNode();
      }
      patchInteractiveLabels(root);
    };

    sanitizeTree(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => sanitizeTree(node));
        sanitizeNode(mutation.target);
        patchInteractiveLabels(mutation.target);
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    return () => observer.disconnect();
  }, []);
}

export function App() {
  useVisibleTextSanitizer();

  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={routePage(<LoginPage />)} />
          <Route
            path="/auth/change-password"
            element={
              <ProtectedRoute>
                <PageSuspense>
                  <ChangePasswordPage />
                </PageSuspense>
              </ProtectedRoute>
            }
          />
          <Route path="/register" element={routePage(<RegisterPage />)} />
          <Route
            path="/user/dashboard"
            element={protectedPage(<UserDashboardPage />, USER_ONLY)}
          />
          <Route
            path="/user/onboarding"
            element={protectedPage(<OnboardingWizardPage />, USER_ONLY)}
          />
          <Route
            path="/user/profile"
            element={protectedPage(<OnboardingWizardPage />, USER_ONLY)}
          />
          <Route
            path="/user/health-data"
            element={protectedPage(<OnboardingWizardPage />, USER_ONLY)}
          />
          <Route
            path="/user/phenotype"
            element={protectedPage(<PhenotypePage />, USER_ONLY)}
          />
          <Route
            path="/user/risk-result"
            element={protectedPage(<PhenotypePage />, USER_ONLY)}
          />
          <Route
            path="/user/prescriptions"
            element={protectedPage(<PrescriptionPage />, USER_ONLY)}
          />
          <Route
            path="/user/prescriptions/:id"
            element={protectedPage(<PrescriptionPage />, USER_ONLY)}
          />
          <Route
            path="/user/today"
            element={protectedPage(<TodayExercisePage />, USER_ONLY)}
          />
          <Route
            path="/user/feedback"
            element={protectedPage(<TodayExercisePage />, USER_ONLY)}
          />
          <Route
            path="/user/phase-report"
            element={protectedPage(<PhaseReportPage />, USER_ONLY)}
          />
          <Route
            path="/user/follow-up-report"
            element={protectedPage(<PhaseReportPage />, USER_ONLY)}
          />
          <Route
            path="/expert/dashboard"
            element={protectedPage(<ExpertReviewPage />, EXPERT_ONLY)}
          />
          <Route
            path="/expert/reviews"
            element={protectedPage(<ExpertReviewPage />, EXPERT_ONLY)}
          />
          <Route
            path="/expert/reviews/:id"
            element={protectedPage(<ExpertReviewPage />, EXPERT_ONLY)}
          />
          <Route
            path="/admin/dashboard"
            element={protectedPage(<AdminDashboardPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/templates"
            element={protectedPage(<AdminTemplatePage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/exercises"
            element={protectedPage(<AdminTemplatePage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/knowledge"
            element={protectedPage(<AdminTemplatePage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/rules"
            element={protectedPage(<AdminRulesPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/clusters"
            element={protectedPage(<AdminClustersPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/clustering"
            element={protectedPage(<AdminClustersPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/users"
            element={protectedPage(<AdminUsersPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/audit-logs"
            element={protectedPage(<AdminAuditPage />, ADMIN_ONLY)}
          />
          <Route
            path="/admin/research-export"
            element={protectedPage(<ResearchExportPage />, ADMIN_ONLY)}
          />
          <Route
            path="/research/export"
            element={protectedPage(<ResearchExportPage />, RESEARCH_ONLY)}
          />
          <Route
            path="/research/dashboard"
            element={protectedPage(<ResearchExportPage />, RESEARCH_ONLY)}
          />
          <Route
            path="/research/cluster-analysis"
            element={protectedPage(<ResearchExportPage />, RESEARCH_ONLY)}
          />
          <Route
            path="/research/intervention-effects"
            element={protectedPage(<ResearchExportPage />, RESEARCH_ONLY)}
          />
          <Route
            path="/research/export-jobs"
            element={protectedPage(<ResearchExportPage />, RESEARCH_ONLY)}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
