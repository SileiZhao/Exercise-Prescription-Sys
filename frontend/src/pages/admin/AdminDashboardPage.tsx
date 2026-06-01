import { Alert, Button, Card, Col, Descriptions, Layout, Row, Space, Statistic, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getAdminDashboardSummary, type AdminDashboardSummary } from "../../api/adminDashboard";

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function Distribution({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  return (
    <Card title={title} className="dashboard-panel">
      {entries.length ? (
        <Descriptions column={1} size="small">
          {entries.map(([key, value]) => (
            <Descriptions.Item key={key} label={key}>
              {value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">暂无数据</Typography.Text>
      )}
    </Card>
  );
}

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getAdminDashboardSummary()
      .then((data) => {
        setSummary(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          管理看板
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          {error ? <Alert type="error" showIcon message="加载管理统计失败，请确认管理员权限。" /> : null}
          <Space wrap>
            <Link to="/admin/users">
              <Button type="primary">用户与专家</Button>
            </Link>
            <Link to="/admin/templates">
              <Button>模板与知识库</Button>
            </Link>
            <Link to="/admin/rules">
              <Button>风险规则</Button>
            </Link>
            <Link to="/admin/clusters">
              <Button>聚类模型</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>审计日志</Button>
            </Link>
            <Link to="/">
              <Button>返回首页</Button>
            </Link>
          </Space>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="用户总数" value={summary?.total_users ?? 0} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="R2审核率" value={summary ? asPercent(summary.r2_review_rate) : "0%"} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="R3转介量" value={summary?.r3_referral_count ?? 0} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="打卡完成率" value={`${summary?.feedback_stats.average_completion_rate ?? 0}%`} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="处方数量" value={Object.values(summary?.prescription_status ?? {}).reduce((a, b) => a + b, 0)} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="dashboard-panel">
                <Statistic title="已审核模板" value={summary?.template_usage.approved_templates ?? 0} />
              </Card>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Distribution title="风险分布" data={summary?.risk_distribution ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Distribution title="处方状态" data={summary?.prescription_status ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Distribution title="审核统计" data={summary?.review_stats ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Distribution title="分型分布" data={summary?.cluster_distribution ?? {}} />
            </Col>
          </Row>
        </Space>
      </Layout.Content>
    </Layout>
  );
}
