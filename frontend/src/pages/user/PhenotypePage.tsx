import { Alert, Button, Card, Layout, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { classifyMe, type ClusterAssignment } from "../../api/clusters";

export function PhenotypePage() {
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState<ClusterAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runClassify() {
    setLoading(true);
    setError(null);
    try {
      setAssignment(await classifyMe());
    } catch {
      setError("生成分型失败，请先完成六类数据采集。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          人群分型
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Card className="phenotype-card">
          <Space direction="vertical" size={16} className="onboarding-section">
            <Alert type="info" showIcon message="分型结果只用于模板匹配，不覆盖风险规则。" />
            {error ? <Alert type="error" showIcon message={error} /> : null}
            {assignment ? (
              <Space direction="vertical" size={12}>
                <Typography.Text strong>规则分型标签</Typography.Text>
                <Space wrap>
                  {assignment.rule_labels.map((label) => (
                    <Tag color="blue" key={label}>
                      {label}
                    </Tag>
                  ))}
                </Space>
                <Typography.Paragraph>{assignment.profile_summary}</Typography.Paragraph>
              </Space>
            ) : (
              <Typography.Paragraph>
                完成基础信息、体质测试、身体成分、生化指标和风险问卷后，可生成健康画像与人群标签。
              </Typography.Paragraph>
            )}
            <Space>
              <Button type="primary" loading={loading} onClick={runClassify}>
                生成分型
              </Button>
              <Link to="/user/dashboard">
                <Button>返回用户端</Button>
              </Link>
            </Space>
          </Space>
        </Card>
      </Layout.Content>
    </Layout>
  );
}
