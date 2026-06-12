import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Card, ConfigProvider, Layout, Space, Tag, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Activity, BarChart3, BookOpen, ClipboardCheck, Database, FileText, FlaskConical, ShieldCheck, Stethoscope, Users } from "lucide-react";

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

type EntryCard = {
  title: string;
  status: string;
  summary: string;
  icon: ReactNode;
  path: string;
  tasks: string[];
};

const systemStatus = [
  { label: "规则库", value: "80 条规则", status: "ONLINE", icon: <ShieldCheck /> },
  { label: "RAG", value: "57 份资料", status: "READY", icon: <BookOpen /> },
  { label: "LLM", value: "aliyun / dashscope", status: "REAL", icon: <Database /> },
  { label: "审核队列", value: "R2 优先", status: "ACTIVE", icon: <ClipboardCheck /> }
];

const entryCards: EntryCard[] = [
  {
    title: "用户端",
    status: "Demo 闭环",
    summary: "今日安全状态、六类数据建档、风险判定、处方查看与反馈预警。",
    icon: <Users />,
    path: "/user/dashboard",
    tasks: ["今日可运动判断", "FITT-VP 处方摘要", "RPE / 疼痛反馈"]
  },
  {
    title: "专家端",
    status: "R2 审核",
    summary: "三栏审核工作台，核查 AI 初稿、规则命中、RAG 证据与版本审计。",
    icon: <Stethoscope />,
    path: "/expert/reviews",
    tasks: ["待审队列", "结构化修改", "批准前安全 checklist"]
  },
  {
    title: "管理端",
    status: "运营驾驶舱",
    summary: "用户、处方、规则、模板、动作库、知识库和审计的运营监控。",
    icon: <BarChart3 />,
    path: "/admin/dashboard",
    tasks: ["6 项 KPI", "规则/模板配置", "RAG 索引状态"]
  },
  {
    title: "科研端",
    status: "脱敏聚合",
    summary: "只展示脱敏聚合数据，支持分型分析、干预效果和导出审批。",
    icon: <FlaskConical />,
    path: "/research/export",
    tasks: ["subject_id 明细", "干预前后对比", "导出审批"]
  }
];

function HomePage() {
  return (
    <Layout className="app-shell public-workbench-shell">
      <Layout.Header className="app-header public-workbench-header">
        <Space size={10} align="center">
          <span className="brand-mark"><Activity size={18} /></span>
          <Typography.Title level={3} className="app-title">
            AI 个性化运动处方平台
          </Typography.Title>
        </Space>
        <Tag color="blue">Demo 数据</Tag>
      </Layout.Header>
      <Layout.Content className="app-content public-workbench-content">
        <section className="workbench-banner" aria-label="平台工作台入口">
          <div className="workbench-copy">
            <Typography.Text className="workbench-eyebrow">平台工作台入口</Typography.Text>
            <Typography.Title level={2}>AI 个性化运动处方平台</Typography.Title>
            <Typography.Paragraph>
              R2 审核前不下发训练计划；R3 仅展示医学评估与转介建议。当前入口用于领导汇报、专家评审和试点单位演示。
            </Typography.Paragraph>
          </div>
          <div className="system-status-strip" aria-label="系统状态">
            {systemStatus.map((item) => (
              <div key={item.label} className="system-status-item">
                <span className="system-status-icon">{item.icon}</span>
                <div>
                  <Typography.Text className="system-status-label">{item.label}</Typography.Text>
                  <Typography.Text strong>{item.value}</Typography.Text>
                </div>
                <Tag color={item.status === "REAL" ? "green" : "blue"}>{item.status}</Tag>
              </div>
            ))}
          </div>
        </section>
        <section className="entry-grid workbench-entry-grid" aria-label="角色工作区入口">
          {entryCards.map((item) => (
            <Card key={item.title} className="entry-card workbench-entry-card">
              <div className="entry-card-topline">
                <span className="entry-icon">{item.icon}</span>
                <Tag color="blue">{item.status}</Tag>
              </div>
              <Typography.Title level={4}>{item.title}</Typography.Title>
              <Typography.Paragraph>{item.summary}</Typography.Paragraph>
              <ul className="entry-task-list">
                {item.tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
              <Link to={item.path} className="entry-action-link">
                <Button type="primary" icon={<FileText size={16} />}>{`进入${item.title}`}</Button>
              </Link>
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
