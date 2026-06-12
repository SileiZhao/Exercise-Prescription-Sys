import { AppstoreOutlined, ExperimentOutlined, MedicineBoxOutlined, TeamOutlined } from "@ant-design/icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Card, ConfigProvider, Layout, Space, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
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

const queryClient = new QueryClient();

const entryCards = [
  {
    title: "用户端",
    description: "建档、六类数据采集、风险结果、处方查看与运动打卡。",
    icon: <AppstoreOutlined />,
    path: "/user/dashboard"
  },
  {
    title: "专家端",
    description: "审核 R2 初稿、查看风险证据、结构化修改并发布处方。",
    icon: <MedicineBoxOutlined />,
    path: "/expert/reviews"
  },
  {
    title: "管理端",
    description: "管理用户、专家、规则、模板、知识库、动作库和审计日志。",
    icon: <TeamOutlined />,
    path: "/admin/dashboard"
  },
  {
    title: "科研端",
    description: "查看脱敏数据、分型统计、干预效果分析与合规导出。",
    icon: <ExperimentOutlined />,
    path: "/research/export"
  }
];

function HomePage() {
  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          AI 个性化运动处方平台
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <section className="entry-grid" aria-label="平台入口">
          {entryCards.map((item) => (
            <Card key={item.title} className="entry-card">
              <Space direction="vertical" size={12}>
                <span className="entry-icon">{item.icon}</span>
                <Typography.Title level={4}>{item.title}</Typography.Title>
                <Typography.Paragraph>{item.description}</Typography.Paragraph>
                <Link to={item.path}>
                  <Button type="primary">进入</Button>
                </Link>
              </Space>
            </Card>
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

export function App() {
  return (
    <ConfigProvider locale={zhCN}>
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
