import { Alert, Button, Card, Col, Descriptions, Layout, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  exportDesensitizedUsers,
  getResearchSummary,
  type DesensitizedUserRow,
  type ResearchSummary
} from "../../api/researchExport";

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

export function ResearchExportPage() {
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [rows, setRows] = useState<DesensitizedUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getResearchSummary(), exportDesensitizedUsers()])
      .then(([summaryData, exportData]) => {
        setSummary(summaryData);
        setRows(exportData.items);
        setTotal(exportData.total);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          科研脱敏导出
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          {error ? <Alert type="error" showIcon message="加载科研数据失败，请确认科研权限。" /> : null}
          <Space wrap>
            <Link to="/">
              <Button>返回首页</Button>
            </Link>
            <Typography.Text type="secondary">科研导出仅展示匿名编码和脱敏指标。</Typography.Text>
          </Space>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}>
              <Card className="dashboard-panel">
                <Statistic title="脱敏样本量" value={summary?.total_participants ?? total} loading={loading} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card className="dashboard-panel">
                <Statistic title="打卡记录数" value={summary?.intervention_effects.feedback_count ?? 0} loading={loading} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card className="dashboard-panel">
                <Statistic title="平均完成率" suffix="%" value={summary?.intervention_effects.average_completion_rate ?? 0} precision={1} loading={loading} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card className="dashboard-panel">
                <Statistic title="平均RPE" value={summary?.intervention_effects.average_rpe ?? 0} precision={1} loading={loading} />
              </Card>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Distribution title="风险分布" data={summary?.risk_distribution ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Distribution title="分型统计" data={summary?.cluster_distribution ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Distribution title="处方状态" data={summary?.prescription_status ?? {}} />
            </Col>
            <Col xs={24} md={12}>
              <Card title="干预效果" className="dashboard-panel">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="不适事件">{summary?.intervention_effects.discomfort_event_count ?? 0}</Descriptions.Item>
                  <Descriptions.Item label="疼痛加重">{summary?.intervention_effects.pain_worsened_count ?? 0}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
          <Card title="脱敏数据明细">
            <Table
              rowKey="participant_code"
              loading={loading}
              dataSource={rows}
              pagination={false}
              scroll={{ x: 960 }}
              locale={{ emptyText: "暂无脱敏数据" }}
              columns={[
                { title: "匿名编码", dataIndex: "participant_code" },
                {
                  title: "年龄",
                  render: (_: unknown, record) => record.profile.age as string
                },
                {
                  title: "性别",
                  render: (_: unknown, record) => record.profile.sex as string
                },
                {
                  title: "BMI",
                  render: (_: unknown, record) => record.profile.bmi as string
                },
                {
                  title: "风险等级",
                  render: (_: unknown, record) => {
                    const level = record.risk_screening?.risk_level as string | undefined;
                    return level ? <Tag color={level === "R3" ? "red" : level === "R2" ? "orange" : "blue"}>{level}</Tag> : "-";
                  }
                },
                {
                  title: "分型",
                  render: (_: unknown, record) => (record.latest_prescription?.cluster_label as string | undefined) || "-"
                },
                {
                  title: "处方状态",
                  render: (_: unknown, record) => (record.latest_prescription?.status as string | undefined) || "-"
                }
              ]}
            />
          </Card>
        </Space>
      </Layout.Content>
    </Layout>
  );
}
