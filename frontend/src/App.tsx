import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Card, ConfigProvider, Layout, Spin, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ArrowRight, LineChart, Settings, Stethoscope, User } from "lucide-react";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { antdTheme } from "./components/ProductUI";
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
const PasswordSupportPage = lazyPage(lazyPageLoaders.passwordSupport, "PasswordSupportPage");
const PhenotypePage = lazyPage(lazyPageLoaders.phenotype, "PhenotypePage");
const PhaseReportPage = lazyPage(lazyPageLoaders.phaseReport, "PhaseReportPage");
const PrescriptionPage = lazyPage(lazyPageLoaders.prescription, "PrescriptionPage");
const RegisterPage = lazyPage(lazyPageLoaders.register, "RegisterPage");
const ResearchExportPage = lazyPage(lazyPageLoaders.researchExport, "ResearchExportPage");
const TodayExercisePage = lazyPage(lazyPageLoaders.todayExercise, "TodayExercisePage");
const UserDashboardPage = lazyPage(lazyPageLoaders.userDashboard, "UserDashboardPage");

const entryCards = [
  {
    title: "普通用户",
    description: "建档与运动执行",
    detail: "完成六类数据采集，查看风险结论、处方状态和今日运动通行证。",
    task: "进入用户端",
    role: "USER",
    icon: <User aria-hidden="true" />,
    tone: "user",
    path: "/user/dashboard"
  },
  {
    title: "处方专家",
    description: "高风险审核与分诊",
    detail: "处理 R2 待审处方、异常反馈、医学评估和证据核对任务。",
    task: "进入专家端",
    role: "EXPERT",
    icon: <Stethoscope aria-hidden="true" />,
    tone: "expert",
    path: "/expert/reviews"
  },
  {
    title: "系统管理",
    description: "规则治理与上线配置",
    detail: "管理风险规则、模板动作、知识索引、用户权限和上线闸口。",
    task: "进入管理端",
    role: "ADMIN",
    icon: <Settings aria-hidden="true" />,
    tone: "admin",
    path: "/admin/dashboard"
  },
  {
    title: "科研人员",
    description: "脱敏数据与干预分析",
    detail: "查看脱敏聚合指标，提交导出申请，分析分型与干预效果。",
    task: "进入科研端",
    role: "RESEARCHER",
    icon: <LineChart aria-hidden="true" />,
    tone: "research",
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

function HomePage() {
  const currentRole = localStorage.getItem("current_user_role");
  const currentUserName = localStorage.getItem("current_user_name") || localStorage.getItem("current_user_email") || "当前账号";
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));
  const currentEntryRole = currentRole === "ORG_ADMIN" ? "ADMIN" : currentRole;
  const activeEntry = entryCards.find((item) => item.role === currentEntryRole) ?? entryCards[0];
  const currentRoleLabel = currentRole ? roleLabelByAuthRole[currentRole] ?? currentRole : "";

  return (
    <Layout className="public-home-shell">
      <div className="public-home-bg" aria-hidden="true">
        <div className="public-home-grid" />
        <div className="public-home-visual" />
      </div>

      <header className="public-home-header">
        <Link to="/" className="public-home-brand" aria-label="启衡临床运动干预中台首页">
          <span className="public-home-brand-mark">启</span>
          <Typography.Title level={4} className="public-home-title">
            启衡临床运动干预中台
          </Typography.Title>
        </Link>
        <nav className="public-home-actions" aria-label="账户操作">
          {isLoggedIn ? (
            <>
              <span className="public-home-user">{currentRoleLabel || activeEntry.title} · {currentUserName}</span>
              <Link to={activeEntry.path}>
                <Button type="primary">进入我的工作台</Button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/register">
                <Button type="default">注册</Button>
              </Link>
              <Link to="/login">
                <Button type="primary">登录工作台</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <Layout.Content className="public-home-main">
        <main className="public-home-router" aria-label="角色入口分流">
          <Typography.Text type="secondary" className="public-home-statement">
            受监管的医疗场景 · 风险分级 · 专家审核 · 科研治理
          </Typography.Text>
          <section className="public-role-grid" aria-label="选择角色工作台">
            {entryCards.map((item) => {
              const isActive = currentEntryRole === item.role;
              const targetPath = isLoggedIn ? item.path : "/login";
              return (
                <Link
                  to={targetPath}
                  key={item.role}
                  className="public-role-link"
                  aria-label={`${item.title}，${item.description}`}
                >
                  <Card
                    hoverable
                    className={`public-role-card public-role-card-${item.tone}${isActive ? " is-current" : ""}`}
                  >
                    <span className="public-role-icon">{item.icon}</span>
                    <span className="public-role-kicker">{item.role}</span>
                    <Typography.Title level={3}>{item.title}</Typography.Title>
                    <Typography.Text className="public-role-description">{item.description}</Typography.Text>
                    <Typography.Paragraph className="public-role-detail">{item.detail}</Typography.Paragraph>
                    <span className="public-role-action">
                      {isLoggedIn && isActive ? "当前角色" : item.task}
                      <ArrowRight aria-hidden="true" />
                    </span>
                  </Card>
                </Link>
              );
            })}
          </section>
        </main>
      </Layout.Content>

      <footer className="public-security-banner">
        系统提供运动指导与处方辅助，不替代临床医疗诊断。高风险场景 (R3) 严格阻断。
      </footer>
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
    .replace(/AI\s*个性化运动处方平台/g, "启衡运动处方系统")
    .replace(/AI\s*运动处方/g, "启衡")
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
          <Route path="/password-support" element={routePage(<PasswordSupportPage />)} />
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
