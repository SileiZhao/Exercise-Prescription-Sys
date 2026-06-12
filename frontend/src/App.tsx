import { AppstoreOutlined, ExperimentOutlined, MedicineBoxOutlined, TeamOutlined } from "@ant-design/icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, ConfigProvider, Layout } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { ClinicalStatusBadge, antdTheme } from "./components/ProductUI";
import type { AuthUserRole } from "./auth/token";
import { AdminAuditPage } from "./pages/admin/AdminAuditPage";
import { AdminClustersPage } from "./pages/admin/AdminClustersPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminRulesPage } from "./pages/admin/AdminRulesPage";
import { AdminTemplatePage } from "./pages/admin/AdminTemplatePage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { ExpertReviewPage } from "./pages/expert/ExpertReviewPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResearchExportPage } from "./pages/research/ResearchExportPage";
import { OnboardingWizardPage } from "./pages/user/OnboardingWizardPage";
import { PhenotypePage } from "./pages/user/PhenotypePage";
import { PhaseReportPage } from "./pages/user/PhaseReportPage";
import { PrescriptionPage } from "./pages/user/PrescriptionPage";
import { TodayExercisePage } from "./pages/user/TodayExercisePage";
import { UserDashboardPage } from "./pages/user/UserDashboardPage";
import "./styles.css";
import "./product-layout.css";
import "./clinical-workbench.css";
import "./user-experience.css";

const queryClient = new QueryClient();

const entryCards = [
  {
    title: "用户端",
    description: "建档、查看风险结论、接收处方和完成运动反馈。",
    task: "确认能否运动",
    role: "USER",
    icon: <AppstoreOutlined />,
    path: "/user/dashboard"
  },
  {
    title: "专家端",
    description: "处理 R2 处方、异常反馈和需要人工判断的任务。",
    task: "处理审核队列",
    role: "EXPERT",
    icon: <MedicineBoxOutlined />,
    path: "/expert/dashboard"
  },
  {
    title: "管理端",
    description: "管理规则、模板、知识库、用户权限和上线审计。",
    task: "检查运营闸口",
    role: "ADMIN",
    icon: <TeamOutlined />,
    path: "/admin/dashboard"
  },
  {
    title: "科研端",
    description: "查看脱敏聚合指标，提交和下载已审批的数据导出。",
    task: "查看脱敏总览",
    role: "RESEARCHER",
    icon: <ExperimentOutlined />,
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
  ["风险分级", "R0-R3", "R2 人工审核，R3 转介阻断"],
  ["证据链路", "规则 + 知识库", "处方发布前保留来源"],
  ["科研治理", "脱敏导出", "审批通过后限时下载"]
];

const safetyBoundaries = [
  ["R2", "进入专家审核", "处方发布前必须完成证据核对。"],
  ["R3", "医学评估优先", "系统只展示转介或机构复评建议。"],
  ["导出", "审批后开放", "科研数据默认脱敏并记录下载行为。"]
];

function HomePage() {
  const currentRole = localStorage.getItem("current_user_role");
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));
  const activeEntry = entryCards.find((item) => item.role === currentRole) ?? entryCards[0];
  const currentRoleLabel = currentRole ? roleLabelByAuthRole[currentRole] ?? currentRole : "";

  return (
    <Layout className="app-shell home-shell">
      <header className="home-topbar">
        <Link to="/" className="home-brand-lockup" aria-label="启衡首页">
          <span className="home-brand-mark">启</span>
          <span>
            <strong>启衡</strong>
            <small>运动处方与健康干预系统</small>
          </span>
        </Link>
        <nav className="home-top-actions" aria-label="账户操作">
          {isLoggedIn ? (
            <Link to={activeEntry.path}>
              <Button>进入当前工作台</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button>登录账号</Button>
            </Link>
          )}
          <Link to={isLoggedIn ? "/login" : "/register"}>
            <Button>{isLoggedIn ? "切换账号" : "注册用户"}</Button>
          </Link>
        </nav>
      </header>

      <Layout.Content className="home-content">
        <main className="home-gateway" aria-label="角色控制台入口">
          <section className="home-briefing">
            <div className="home-kicker">临床运动干预中台</div>
            <h1>安全评估先行，处方执行随后</h1>
            <p className="home-briefing-copy">
              启衡把建档、风险分级、专家审核、规则治理和科研导出收在同一个受控入口，先确认边界，再进入任务。
            </p>
            <div className="home-briefing-actions">
              <Link to={isLoggedIn ? activeEntry.path : "/login"}>
                <Button type="primary" size="large" className="home-primary-action">
                  {isLoggedIn ? `进入${activeEntry.title}` : "登录账号"}
                </Button>
              </Link>
              <Link to="/register">
                <Button size="large" className="home-secondary-action">注册用户</Button>
              </Link>
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
          </section>

          <aside className="home-access-panel" aria-label="选择工作台">
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
            <div className="home-current-task">
              <span>{isLoggedIn ? "当前建议入口" : "登录后按角色进入"}</span>
              <strong>{isLoggedIn ? activeEntry.task : "角色工作台"}</strong>
            </div>
            <nav className="home-role-list" aria-label="工作台列表">
              {entryCards.map((item) => {
                const isActive = currentRole === item.role;
                return (
                  <Link
                    key={item.title}
                    to={isLoggedIn ? item.path : "/login"}
                    className={`home-role-row${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="home-role-icon" aria-hidden="true">{item.icon}</span>
                    <span className="home-role-copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="home-role-action">{isActive ? "进入" : item.task}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </main>

        <section className="home-safety-rail" aria-label="安全边界">
          {safetyBoundaries.map(([label, title, detail]) => (
            <div className="home-safety-item" key={label}>
              <span>{label}</span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>
      </Layout.Content>
    </Layout>
  );
}

function protectedPage(page: JSX.Element, allowedRoles?: AuthUserRole[]) {
  return <ProtectedRoute allowedRoles={allowedRoles}>{page}</ProtectedRoute>;
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
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/auth/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
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
