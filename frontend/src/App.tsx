import { AppstoreOutlined, ExperimentOutlined, MedicineBoxOutlined, TeamOutlined } from "@ant-design/icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert, Button, Card, ConfigProvider, Layout, Space, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { callNotImplemented } from "./api/notImplemented";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminAuditPage } from "./pages/admin/AdminAuditPage";
import { AdminClustersPage } from "./pages/admin/AdminClustersPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminRulesPage } from "./pages/admin/AdminRulesPage";
import { AdminTemplatePage } from "./pages/admin/AdminTemplatePage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { ExpertReviewPage } from "./pages/expert/ExpertReviewPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResearchExportPage } from "./pages/research/ResearchExportPage";
import { OnboardingWizardPage } from "./pages/user/OnboardingWizardPage";
import { PhenotypePage } from "./pages/user/PhenotypePage";
import { PhaseReportPage } from "./pages/user/PhaseReportPage";
import { PrescriptionPage } from "./pages/user/PrescriptionPage";
import { TodayExercisePage } from "./pages/user/TodayExercisePage";
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

function PlaceholderPage({ title }: { title: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  async function showNotImplemented(path: string) {
    setNotice(await callNotImplemented(path));
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          {title}
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Card>
          {notice ? <Alert className="form-alert" type="warning" showIcon message={notice} /> : null}
          <Typography.Paragraph>
            阶段 1 已建立路由入口。业务表单、权限守卫和数据流将在后续阶段逐步接入。
          </Typography.Paragraph>
          {title === "用户端" ? (
            <Space>
              <Link to="/user/onboarding">
                <Button type="primary">继续建档</Button>
              </Link>
              <Link to="/user/phenotype">
                <Button>查看分型</Button>
              </Link>
              <Link to="/user/prescriptions">
                <Button>我的处方</Button>
              </Link>
              <Link to="/user/today">
                <Button>今日运动</Button>
              </Link>
              <Link to="/user/phase-report">
                <Button>阶段报告</Button>
              </Link>
              <Button onClick={() => showNotImplemented("/device-integrations/sync")}>设备接口</Button>
            </Space>
          ) : null}
          {title === "管理端" ? (
            <Space>
              <Link to="/admin/users">
                <Button type="primary">用户与专家</Button>
              </Link>
              <Link to="/admin/templates">
                <Button>管理模板库</Button>
              </Link>
              <Link to="/admin/rules">
                <Button>风险规则</Button>
              </Link>
              <Link to="/admin/clusters">
                <Button>聚类模型</Button>
              </Link>
              <Link to="/admin/audit-logs">
                <Button>审计日志</Button>
              </Link>
              <Button onClick={() => showNotImplemented("/pilot-materials/list")}>试点资料</Button>
              <Button onClick={() => showNotImplemented("/report-templates/list")}>报告模板</Button>
              <Button onClick={() => showNotImplemented("/deliverables/generate")}>成果交付物</Button>
            </Space>
          ) : null}
          <Link to="/">
            <Button>返回首页</Button>
          </Link>
        </Card>
      </Layout.Content>
    </Layout>
  );
}

export function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/user/dashboard"
            element={
              <ProtectedRoute>
                <PlaceholderPage title="用户端" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/phenotype"
            element={
              <ProtectedRoute>
                <PhenotypePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/prescriptions"
            element={
              <ProtectedRoute>
                <PrescriptionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/today"
            element={
              <ProtectedRoute>
                <TodayExercisePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/phase-report"
            element={
              <ProtectedRoute>
                <PhaseReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expert/reviews"
            element={
              <ProtectedRoute>
                <ExpertReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/templates"
            element={
              <ProtectedRoute>
                <AdminTemplatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rules"
            element={
              <ProtectedRoute>
                <AdminRulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/clusters"
            element={
              <ProtectedRoute>
                <AdminClustersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <ProtectedRoute>
                <AdminAuditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/research/export"
            element={
              <ProtectedRoute>
                <ResearchExportPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
