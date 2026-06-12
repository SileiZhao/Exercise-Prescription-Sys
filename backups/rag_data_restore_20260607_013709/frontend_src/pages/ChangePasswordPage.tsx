import { Alert, Button, Card, Form, Input, Layout, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword } from "../api/auth";
import { clearRefreshToken } from "../auth/token";

type ChangePasswordValues = {
  current_password: string;
  new_password: string;
};

export function ChangePasswordPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleFinish(values: ChangePasswordValues) {
    setLoading(true);
    setNotice(null);
    try {
      await changePassword(values);
      clearRefreshToken();
      setNotice("密码已修改，请继续使用新密码登录。");
      navigate("/login", { replace: true });
    } catch {
      setNotice("修改密码失败，请确认当前密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="auth-shell">
      <Card className="auth-card">
        <Typography.Title level={3}>首次登录修改密码</Typography.Title>
        {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon className="form-alert" /> : null}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item label="当前密码" name="current_password" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item label="新密码" name="new_password" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            确认修改
          </Button>
        </Form>
      </Card>
    </Layout>
  );
}
