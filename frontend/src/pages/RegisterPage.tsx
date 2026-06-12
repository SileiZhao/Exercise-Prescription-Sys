import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerUser } from "../api/auth";
import { ClinicalStatusBadge, ProcessRail } from "../components/ProductUI";

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
      <div className="auth-frame">
        <section className="auth-context-panel" aria-label="注册说明">
          <div className="auth-context-copy">
            <Space className="auth-meta-row">
              <ClinicalStatusBadge type="readiness" value="ready" label="普通用户注册" />
              <ClinicalStatusBadge type="readiness" value="degraded" label="需完成建档" />
            </Space>
            <Typography.Title level={3}>创建普通用户账号</Typography.Title>
            <Typography.Paragraph>
              注册后进入用户端建档向导。平台会先采集知情同意、基础信息、体测、体成分、生化指标和风险问卷，再开放风险分型与处方生成。
            </Typography.Paragraph>
          </div>
          <ProcessRail
            title="新用户路径"
            description="注册只创建普通用户账号，后续权限由管理端治理。"
            steps={[
              {
                title: "创建账号",
                description: "填写邮箱、姓名、密码，进入用户端建档。",
                status: "active"
              },
              {
                title: "六类数据",
                description: "按知情同意、基础信息、体测、体成分、生化和风险问卷分步采集。",
                status: "pending"
              },
              {
                title: "风险决策",
                description: "R0/R1 可生成处方，R2 审核，R3 转医学评估建议。",
                status: "pending"
              }
            ]}
          />
        </section>
        <Card className="auth-card">
          <Typography.Title level={3}>注册账号</Typography.Title>
          <Typography.Paragraph type="secondary">填写基础身份信息后继续登录建档。</Typography.Paragraph>
          {error ? <Alert type="error" message={error} showIcon className="form-alert" /> : null}
          <Form layout="vertical" onFinish={handleFinish}>
            <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email" }]}>
              <Input autoComplete="email" placeholder="name@example.com" />
            </Form.Item>
            <Form.Item label="姓名" name="full_name" rules={[{ required: true }]}>
              <Input autoComplete="name" placeholder="真实姓名或匿名编码" />
            </Form.Item>
            <Form.Item label="手机号" name="phone">
              <Input autoComplete="tel" placeholder="用于试点联系，可选" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, min: 8 }]}>
              <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
            </Form.Item>
            <Button className="auth-primary-action" type="primary" htmlType="submit" loading={loading} block>
              创建账号
            </Button>
          </Form>
          <Typography.Paragraph className="auth-link">
            已有账号？<Link to="/login">返回登录</Link>
          </Typography.Paragraph>
        </Card>
      </div>
    </Layout>
  );
}
