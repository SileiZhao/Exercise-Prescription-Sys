import { Alert, Button, Card, Form, Input, Layout, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerUser } from "../api/auth";

type RegisterFormValues = {
  email: string;
  phone?: string;
  full_name: string;
  password: string;
};

export function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleFinish(values: RegisterFormValues) {
    setLoading(true);
    setError(null);
    try {
      await registerUser(values);
      navigate("/login");
    } catch {
      setError("注册失败，请检查邮箱、手机号是否已存在。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="auth-shell">
      <Card className="auth-card">
        <Typography.Title level={3}>注册</Typography.Title>
        {error ? <Alert type="error" message={error} showIcon className="form-alert" /> : null}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email" }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item label="姓名" name="full_name" rules={[{ required: true }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item label="手机号" name="phone">
            <Input autoComplete="tel" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            注册
          </Button>
        </Form>
        <Typography.Paragraph className="auth-link">
          已有账号？<Link to="/login">登录</Link>
        </Typography.Paragraph>
      </Card>
    </Layout>
  );
}
