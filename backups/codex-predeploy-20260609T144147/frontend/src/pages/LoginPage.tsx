import { Alert, Button, Card, Form, Input, Layout, Typography } from "antd";
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
      <Card className="auth-card">
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
    </Layout>
  );
}
