import { Alert, Button, Card, Col, Form, Input, Layout, Row, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listClusterModels, trainClusterModel, updateClusterModelStatus } from "../../api/clusters";

type ClusterModel = {
  id: number;
  name: string;
  algorithm: string;
  n_clusters: number;
  feature_names: string[];
  cluster_profiles: Array<{
    cluster_id: number;
    size: number;
    suggested_labels: string[];
    explanation: string;
  }>;
  metrics: Record<string, number>;
  status: "TRAINED" | "ACTIVE" | "ARCHIVED";
  created_at: string;
};

type TrainValues = {
  name: string;
  n_clusters: string | number;
};

function metricText(metrics: Record<string, number>) {
  return metrics.silhouette_score ?? "-";
}

export function AdminClustersPage() {
  const [models, setModels] = useState<ClusterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshModels() {
    setLoading(true);
    setError(null);
    try {
      setModels(await listClusterModels());
    } catch {
      setError("聚类模型加载失败，请确认管理员、科研人员或机构管理员权限。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshModels();
  }, []);

  async function train(values: TrainValues) {
    setSaving(true);
    setNotice(null);
    try {
      await trainClusterModel({
        name: values.name,
        n_clusters: Number(values.n_clusters)
      });
      await refreshModels();
      setNotice("聚类模型训练完成，可在列表中启用。");
    } catch {
      setNotice("聚类模型训练失败，请检查样本量是否大于聚类数。");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(modelId: number, status: "ACTIVE" | "ARCHIVED") {
    setSaving(true);
    setNotice(null);
    try {
      await updateClusterModelStatus(modelId, {
        status,
        reason: status === "ACTIVE" ? "管理端启用聚类模型" : "管理端归档聚类模型"
      });
      await refreshModels();
      setNotice(status === "ACTIVE" ? "聚类模型已启用，其它模型已自动归档。" : "聚类模型已归档。");
    } catch {
      setNotice("更新聚类模型状态失败，请检查权限或稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          聚类模型管理
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          <Alert type="info" showIcon message="聚类模型只用于健康画像和模板匹配，不覆盖 R0/R1/R2/R3 风险规则。" />
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Card title="训练 KMeans 分型模型">
            <Form layout="vertical" onFinish={train} initialValues={{ name: "KMeans 人群分型模型", n_clusters: 3 }}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="name" label="模型名称" rules={[{ required: true, message: "请填写模型名称" }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="n_clusters" label="聚类数" rules={[{ required: true, message: "请填写聚类数" }]}>
                    <Input type="number" min={2} max={8} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={saving}>
                训练模型
              </Button>
            </Form>
          </Card>
          <Card title="模型版本">
            <Table
              rowKey="id"
              loading={loading}
              dataSource={models}
              pagination={false}
              locale={{ emptyText: "暂无聚类模型，请先积累样本并训练。" }}
              columns={[
                { title: "模型名称", dataIndex: "name" },
                { title: "算法", dataIndex: "algorithm" },
                { title: "聚类数", dataIndex: "n_clusters" },
                { title: "轮廓系数", render: (_: unknown, record: ClusterModel) => metricText(record.metrics) },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (status: ClusterModel["status"]) => (
                    <Tag color={status === "ACTIVE" ? "green" : status === "ARCHIVED" ? "default" : "blue"}>{status}</Tag>
                  )
                },
                {
                  title: "分型解释",
                  render: (_: unknown, record: ClusterModel) =>
                    record.cluster_profiles?.length ? record.cluster_profiles[0].explanation : "-"
                },
                {
                  title: "操作",
                  render: (_: unknown, record: ClusterModel) => (
                    <Space>
                      <Button
                        aria-label={`启用模型 ${record.name}`}
                        size="small"
                        disabled={record.status === "ACTIVE"}
                        loading={saving}
                        onClick={() => updateStatus(record.id, "ACTIVE")}
                      >
                        启用模型
                      </Button>
                      <Button
                        aria-label={`归档模型 ${record.name}`}
                        size="small"
                        disabled={record.status === "ARCHIVED"}
                        loading={saving}
                        onClick={() => updateStatus(record.id, "ARCHIVED")}
                      >
                        归档
                      </Button>
                    </Space>
                  )
                }
              ]}
            />
          </Card>
          <Link to="/admin/dashboard">
            <Button>返回管理端</Button>
          </Link>
        </Space>
      </Layout.Content>
    </Layout>
  );
}
