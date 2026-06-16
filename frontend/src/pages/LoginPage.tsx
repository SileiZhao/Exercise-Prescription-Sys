import { Alert, Button, Card, Form, Input, Layout, Typography } from "antd";
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
import { ClinicalStatusBadge } from "../components/ProductUI";

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
  ["用户端", "今日能否运动"],
  ["专家端", "R2 审核队列"],
  ["管理端", "规则与模板"],
  ["科研端", "脱敏分析"]
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
            <span className="auth-brand-mark">衡</span>
            <span>
              <strong>衡策运动处方平台</strong>
              <small>机构账号登录</small>
            </span>
          </div>
          <Typography.Title level={3}>登录账号</Typography.Title>
          <Typography.Paragraph type="secondary">
            使用机构账号进入对应工作台，系统按角色打开当前任务。
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
              登录进入工作台
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
            <div className="auth-meta-row">
              <ClinicalStatusBadge type="readiness" value="ready" label="角色工作台" />
              <ClinicalStatusBadge type="review" value="pending_review" label="R2 专家审核" />
              <ClinicalStatusBadge type="risk" value="R3" label="R3 训练阻断" />
            </div>
            <Typography.Title level={3}>登录后进入受控处方链路</Typography.Title>
            <Typography.Paragraph>
              衡策按账号角色打开任务界面，R2/R3 风险、处方发布和科研导出都先经过安全门控。
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
              {authAccessLanes.map(([role, task]) => (
                <div key={role}>
                  <strong>{role}</strong>
                  <span>{task}</span>
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
          <div className="auth-control-strip" aria-label="审核与治理闭环">
            <span><b>风险</b>R0-R3 规则命中</span>
            <span><b>审核</b>R2 发布前确认</span>
            <span><b>科研</b>脱敏导出留痕</span>
          </div>
        </motion.section>
      </motion.div>
    </Layout>
  );
}
