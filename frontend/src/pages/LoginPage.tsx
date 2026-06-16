import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Database,
  FileCheck2,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getCurrentUser, login, type UserRole } from "../api/auth";
import { setAccessToken, setCurrentUserId, setCurrentUserRole, setRefreshToken } from "../auth/token";
import { ClinicalStatusBadge, ProcessRail, StatusTile } from "../components/ProductUI";

type LoginFormValues = {
  username: string;
  password: string;
};

const defaultRouteByRole: Record<UserRole, string> = {
  USER: "/user/dashboard",
  EXPERT: "/expert/reviews",
  ADMIN: "/admin/dashboard",
  ORG_ADMIN: "/admin/dashboard",
  RESEARCHER: "/research/dashboard"
};

const authAccessLanes = [
  ["用户端", "今日能否运动", "先显示安全结论"],
  ["专家端", "R2 审核队列", "核对证据后发布"],
  ["管理端", "规则与模板", "维护上线闸口"],
  ["科研端", "脱敏分析", "审批后导出"]
];

const authGateFlow = [
  { title: "账号校验", detail: "机构身份与角色权限", icon: <LockKeyhole size={17} /> },
  { title: "风险门控", detail: "R2/R3 不直接训练", icon: <ShieldAlert size={17} /> },
  { title: "处方发布", detail: "FITT-VP 与禁忌留痕", icon: <FileCheck2 size={17} /> },
  { title: "科研出口", detail: "聚合脱敏与下载审计", icon: <Database size={17} /> }
];

export function LoginPage() {
  const [form] = Form.useForm<LoginFormValues>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";

  async function handleFinish(values: LoginFormValues) {
    setLoading(true);
    setError(null);
    try {
      const token = await login(values);
      setAccessToken(token.access_token);
      setRefreshToken(token.refresh_token);
      const currentUser = await getCurrentUser();
      setCurrentUserRole(currentUser.role);
      setCurrentUserId(currentUser.id);
      const next = from === "/" ? defaultRouteByRole[currentUser.role] : from;
      navigate(token.must_change_password ? "/auth/change-password" : next, { replace: true });
    } catch {
      setError("登录失败，请检查邮箱和密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="auth-shell">
      <div className="auth-background" aria-hidden="true">
        <span className="auth-grid-plane" />
        <span className="auth-scan-line" />
        <span className="auth-vital-line" />
      </div>
      <motion.div
        className="auth-frame"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card className="auth-card">
          <Link to="/" className="auth-back-link">
            <ArrowLeft size={15} />
            返回入口
          </Link>
          <div className="auth-brand-lockup">
            <span className="auth-brand-mark">启</span>
            <span>
              <strong>启衡运动处方平台</strong>
              <small>机构账号登录</small>
            </span>
          </div>
          <Typography.Title level={3}>登录账号</Typography.Title>
          <Typography.Paragraph type="secondary">
            使用邮箱和密码进入对应角色工作台，系统会按权限打开当前任务。
          </Typography.Paragraph>
          {error ? <Alert type="error" message={error} showIcon className="form-alert" /> : null}
          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item label="邮箱" name="username" rules={[{ required: true, type: "email" }]}>
              <Input autoComplete="email" placeholder="name@example.com" prefix={<Mail size={16} />} />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" placeholder="输入登录密码" prefix={<LockKeyhole size={16} />} />
            </Form.Item>
            <Button className="auth-primary-action" type="primary" htmlType="submit" loading={loading} block>
              登录并进入工作台
            </Button>
          </Form>
          <Typography.Paragraph className="auth-link">
            没有账号？<Link to="/register">注册普通用户</Link>
          </Typography.Paragraph>
        </Card>
        <motion.section
          className="auth-context-panel"
          aria-label="登录说明"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-context-copy">
            <Space className="auth-meta-row">
              <ClinicalStatusBadge type="readiness" value="ready" label="角色工作台" />
              <ClinicalStatusBadge type="review" value="pending_review" label="R2 专家审核" />
              <ClinicalStatusBadge type="risk" value="R3" label="R3 训练阻断" />
            </Space>
            <Typography.Title level={3}>登录后进入受控处方链路</Typography.Title>
            <Typography.Paragraph>
              启衡按账号角色打开任务界面，所有 R2/R3 风险、处方发布和科研导出都先经过安全门控。
            </Typography.Paragraph>
          </div>
          <div className="auth-access-map" aria-label="机构登录访问链路">
            <div className="auth-identity-card">
              <div>
                <span>Identity gateway</span>
                <strong>机构账号接入</strong>
                <small>认证后按角色打开最小权限工作台</small>
              </div>
              <ShieldCheck size={24} />
            </div>
            <div className="auth-access-lanes">
              {authAccessLanes.map(([role, task, detail]) => (
                <div key={role}>
                  <strong>{role}</strong>
                  <span>{task}</span>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <div className="auth-prescription-card">
              <div className="auth-prescription-head">
                <Activity size={18} />
                <span>处方安全监控</span>
                <b>READY</b>
              </div>
              <div className="auth-vitals" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="auth-risk-mini">
                <span>R0 可训</span>
                <span>R1 监测</span>
                <span>R2 审核</span>
                <span>R3 阻断</span>
              </div>
            </div>
          </div>
          <div className="auth-gate-flow" aria-label="登录后门控流程">
            {authGateFlow.map((item, index) => (
              <div className="auth-gate-step" key={item.title}>
                <span aria-hidden="true">{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <b>{String(index + 1).padStart(2, "0")}</b>
              </div>
            ))}
          </div>
          <ProcessRail
            title="审核与治理闭环"
            description="关键动作保留审核、证据和审计记录，避免未确认处方直接进入训练。"
            steps={[
              {
                title: "风险分级",
                description: "规则命中 R0-R3，并保留数据缺口和触发原因。",
                status: "active"
              },
              {
                title: "专家确认",
                description: "R2 进入审核，R3 显示转介或机构复评建议。",
                status: "pending"
              },
              {
                title: "脱敏导出",
                description: "科研端只看聚合数据，导出需要审批和下载留痕。",
                status: "pending"
              }
            ]}
          />
          <div className="status-grid auth-status-grid">
            <StatusTile label="风险" value="R0-R3" detail="风险颜色不作为唯一信号" tone="info" />
            <StatusTile label="审核" value="专家确认" detail="处方发布前核验证据" tone="warning" />
            <StatusTile label="科研" value="脱敏出口" detail="审批通过后限时下载" tone="info" />
          </div>
        </motion.section>
      </motion.div>
    </Layout>
  );
}
