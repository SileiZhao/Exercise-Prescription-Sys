import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
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
      <div className="auth-frame">
        <Card className="auth-card">
          <Typography.Title level={3}>登录账号</Typography.Title>
          <Typography.Paragraph type="secondary">使用邮箱和密码进入对应角色工作台。</Typography.Paragraph>
          {error ? <Alert type="error" message={error} showIcon className="form-alert" /> : null}
          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item label="邮箱" name="username" rules={[{ required: true, type: "email" }]}>
              <Input autoComplete="email" placeholder="name@example.com" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" placeholder="输入登录密码" />
            </Form.Item>
            <Button className="auth-primary-action" type="primary" htmlType="submit" loading={loading} block>
              登录并进入工作台
            </Button>
          </Form>
          <Typography.Paragraph className="auth-link">
            没有账号？<Link to="/register">注册普通用户</Link>
          </Typography.Paragraph>
        </Card>
        <section className="auth-context-panel" aria-label="登录说明">
          <div className="auth-context-copy">
            <Space className="auth-meta-row">
              <ClinicalStatusBadge type="readiness" value="ready" label="角色工作台" />
              <ClinicalStatusBadge type="review" value="pending_review" label="R2 专家审核" />
              <ClinicalStatusBadge type="risk" value="R3" label="R3 训练阻断" />
            </Space>
            <Typography.Title level={3}>启衡运动处方系统</Typography.Title>
            <Typography.Paragraph>
              面向运动健康干预、专家审核和科研治理的工作台。系统优先呈现安全边界、审核状态和证据来源，避免未经审核的处方直接进入训练。
            </Typography.Paragraph>
          </div>
          <ProcessRail
            title="工作台安全流程"
            description="不同角色进入各自的任务界面，关键动作保留审核、证据和审计记录。"
            steps={[
              {
                title: "安全边界",
                description: "用户端先显示今日能否运动，R2/R3 不直接进入训练。",
                status: "active"
              },
              {
                title: "审核链路",
                description: "专家端处理待审处方、异常反馈和证据核对。",
                status: "pending"
              },
              {
                title: "脱敏治理",
                description: "科研端只看聚合数据，导出需要审批和下载留痕。",
                status: "pending"
              }
            ]}
          />
          <div className="status-grid auth-status-grid">
            <StatusTile label="R2" value="审核后可见" detail="发布前隐藏训练动作" tone="warning" />
            <StatusTile label="R3" value="医学评估" detail="不生成训练计划" tone="danger" />
            <StatusTile label="科研" value="脱敏导出" detail="审批通过后限时下载" tone="info" />
          </div>
        </section>
      </div>
    </Layout>
  );
}
