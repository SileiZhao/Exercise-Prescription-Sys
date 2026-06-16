import { Alert, Button, Form, Input, Layout, Typography } from "antd";
import { motion } from "framer-motion";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
      setError("登录失败，请检查账号、密码或账号状态。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="login-shell">
      <motion.aside
        className="login-clinical-panel"
        aria-label="平台安全声明"
        initial={{ opacity: 0.98 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="login-panel-photo" aria-hidden="true" />
        <div className="login-panel-grid" aria-hidden="true" />
        <motion.div
          className="login-panel-scan"
          aria-hidden="true"
          animate={{ x: ["-12%", "8%", "-12%"], opacity: [0.18, 0.34, 0.18] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="login-panel-copy">
          <ShieldCheck className="login-shield-icon" aria-hidden="true" />
          <Typography.Title level={1}>安全进入受控工作台</Typography.Title>
          <Typography.Paragraph>
            临床级数据安全校验与全链路审计留痕，角色权限、风险分级、专家审核和科研导出在同一安全边界内执行。
          </Typography.Paragraph>
        </div>

        <div className="login-panel-footer">
          <span>R2 处方审核</span>
          <span>R3 严格阻断</span>
          <span>脱敏科研治理</span>
        </div>
      </motion.aside>

      <main className="login-form-side">
        <section className="login-card" aria-label="系统登录表单">
          <Typography.Title level={2}>系统登录</Typography.Title>
          <Typography.Paragraph>请输入您的受控工作台凭证</Typography.Paragraph>

          <Form form={form} layout="vertical" size="large" onFinish={handleFinish}>
            <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入工作邮箱或账号" }]}>
              <Input
                autoComplete="username"
                prefix={<Mail className="login-input-icon" aria-hidden="true" />}
                placeholder="工作邮箱或账号"
              />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入登录密码" }]}>
              <Input.Password
                autoComplete="current-password"
                prefix={<Lock className="login-input-icon" aria-hidden="true" />}
                placeholder="登录密码"
              />
            </Form.Item>
            <div className="login-error-slot" aria-live="polite">
              {error ? <Alert type="error" message={error} showIcon /> : null}
            </div>
            <Button className="login-primary-action" type="primary" htmlType="submit" loading={loading} block>
              安全登录
            </Button>
          </Form>

          <div className="login-card-links">
            <a href="#password-support">忘记密码？</a>
            <Link to="/register">注册普通用户账户</Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
