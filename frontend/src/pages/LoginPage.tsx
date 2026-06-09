import { Alert, Button, Card, Form, Input, Layout, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, BookOpen, ClipboardCheck, Database, ShieldCheck } from "lucide-react";

import { getCurrentUser, login, type UserRole } from "../api/auth";
import { setAccessToken, setCurrentUserId, setCurrentUserRole, setRefreshToken } from "../auth/token";

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

const loginStatusItems = [
  { label: "规则库", value: "80 条规则", icon: <ShieldCheck size={17} />, tag: "READY" },
  { label: "RAG", value: "57 份资料", icon: <BookOpen size={17} />, tag: "INDEXED" },
  { label: "LLM", value: "aliyun / dashscope", icon: <Database size={17} />, tag: "REAL" },
  { label: "审核队列", value: "R2/R3 专家处置", icon: <ClipboardCheck size={17} />, tag: "ACTIVE" }
];

export function LoginPage() {
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
      <div className="auth-workbench">
        <section className="auth-context-panel" aria-label="平台安全上下文">
          <Space size={10} align="center" className="auth-brand-row">
            <span className="brand-mark"><Activity size={18} /></span>
            <Typography.Text strong>AI 个性化运动处方平台</Typography.Text>
            <Tag className="neutral-status-tag">医疗健康干预中台</Tag>
          </Space>
          <Typography.Title level={2}>安全边界先行的运动处方协作平台</Typography.Title>
          <Typography.Paragraph>
            面向成人一般健康、慢病风险管理、体重管理与心肺/肌力/柔韧提升。R2 审核前不下发训练计划，R3 仅展示医学评估与转介建议。
          </Typography.Paragraph>
          <div className="auth-status-grid" aria-label="系统状态">
            {loginStatusItems.map((item) => (
              <div className="auth-status-item" key={item.label}>
                <span className="auth-status-icon">{item.icon}</span>
                <span>
                  <Typography.Text type="secondary">{item.label}</Typography.Text>
                  <Typography.Text strong>{item.value}</Typography.Text>
                </span>
                <Tag className={item.tag === "REAL" ? "real-status-tag" : "neutral-status-tag"}>{item.tag}</Tag>
              </div>
            ))}
          </div>
          <div className="auth-safety-note">
            <ShieldCheck size={18} />
            <span>登录后按角色进入用户端、专家端、管理端或科研端；科研侧仅展示脱敏聚合数据。</span>
          </div>
        </section>
        <Card className="auth-card">
          <Typography.Text className="auth-card-eyebrow">统一身份入口</Typography.Text>
          <Typography.Title level={3}>登录</Typography.Title>
          {error ? <Alert type="error" message={error} showIcon className="form-alert" /> : null}
          <Form layout="vertical" onFinish={handleFinish}>
            <Form.Item label="邮箱" name="username" rules={[{ required: true, type: "email" }]}>
              <Input autoComplete="email" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>
          <Typography.Paragraph className="auth-link">
            没有账号？<Link to="/register">注册</Link>
          </Typography.Paragraph>
        </Card>
      </div>
    </Layout>
  );
}
