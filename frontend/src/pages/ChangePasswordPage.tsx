import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword } from "../api/auth";
import { clearRefreshToken } from "../auth/token";
import { ClinicalStatusBadge, ProcessRail } from "../components/ProductUI";

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
      <div className="auth-frame">
        <section className="auth-context-panel" aria-label="改密说明">
          <div className="auth-context-copy">
            <Space className="auth-meta-row">
              <ClinicalStatusBadge type="readiness" value="blocked" label="必须改密" />
              <ClinicalStatusBadge type="readiness" value="ready" label="改密后重新登录" />
            </Space>
            <Typography.Title level={3}>首次登录安全确认</Typography.Title>
            <Typography.Paragraph>
              管理员创建或重置后的账号首次登录必须修改密码。完成后系统会清除刷新令牌，要求使用新密码重新进入角色工作台。
            </Typography.Paragraph>
          </div>
          <ProcessRail
            title="安全确认流程"
            description="改密完成前不进入任何业务工作台。"
            steps={[
              {
                title: "验证当前密码",
                description: "确认首次登录或管理员重置后的初始密码仍有效。",
                status: "active"
              },
              {
                title: "刷新会话",
                description: "修改成功后清除刷新令牌，返回登录页重新进入。",
                status: "pending"
              },
              {
                title: "进入角色工作台",
                description: "重新登录后按用户、专家、管理或科研角色进入对应页面。",
                status: "pending"
              }
            ]}
          />
        </section>
        <Card className="auth-card">
          <Typography.Title level={3}>修改初始密码</Typography.Title>
          <Typography.Paragraph type="secondary">先完成密码更新，再重新登录平台。</Typography.Paragraph>
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon className="form-alert" /> : null}
          <Form layout="vertical" onFinish={handleFinish}>
            <Form.Item label="当前密码" name="current_password" rules={[{ required: true, min: 8 }]}>
              <Input.Password autoComplete="current-password" placeholder="输入当前密码" />
            </Form.Item>
            <Form.Item label="新密码" name="new_password" rules={[{ required: true, min: 8 }]}>
              <Input.Password autoComplete="new-password" placeholder="至少 8 位新密码" />
            </Form.Item>
            <Button className="auth-primary-action" type="primary" htmlType="submit" loading={loading} block>
              修改密码并重新登录
            </Button>
          </Form>
        </Card>
      </div>
    </Layout>
  );
}
