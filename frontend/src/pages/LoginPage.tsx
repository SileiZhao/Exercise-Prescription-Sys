import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, Database, LockKeyhole, Mail, ShieldCheck, Stethoscope } from "lucide-react";
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
            <Typography.Title level={3}>安全边界清晰，处方流转可追踪</Typography.Title>
            <Typography.Paragraph>
              启衡运动处方平台面向运动健康干预、专家审核和科研治理，优先呈现安全状态、审核结论和证据来源。
            </Typography.Paragraph>
          </div>
          <div className="auth-visual-console" aria-label="系统状态视觉">
            <div className="auth-console-head">
              <span>
                <Activity size={18} />
                Prescription safety console
              </span>
              <strong>READY</strong>
            </div>
            <div className="auth-vitals">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="auth-console-grid">
              <div>
                <ShieldCheck size={18} />
                <strong>R2 审核</strong>
                <small>专家确认后发布</small>
              </div>
              <div>
                <Stethoscope size={18} />
                <strong>R3 阻断</strong>
                <small>医学评估优先</small>
              </div>
              <div>
                <Database size={18} />
                <strong>科研导出</strong>
                <small>脱敏审批留痕</small>
              </div>
            </div>
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
        </motion.section>
      </motion.div>
    </Layout>
  );
}
