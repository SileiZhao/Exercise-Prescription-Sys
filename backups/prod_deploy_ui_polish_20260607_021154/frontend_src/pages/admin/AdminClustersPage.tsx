import { Alert, Button, Card, Col, Descriptions, Form, Input, Row, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listClusterModels, trainClusterModel, updateClusterModelStatus } from "../../api/clusters";
import { AppShell, ChartCard } from "../../components/ProductUI";
import { ClusterScatterChart } from "../../components/charts";

type ClusterAlgorithm = "KMeans" | "DBSCAN" | "GaussianMixture" | "AgglomerativeClustering";

type ClusterModel = {
  id: number;
  name: string;
  algorithm: ClusterAlgorithm;
  n_clusters: number;
  model_origin?: string;
  feature_names: string[];
  cluster_profiles: Array<{
    cluster_id: number;
    size: number;
    suggested_labels: string[];
    explanation: string;
    core_risks?: string[];
    exercise_goals?: string[];
    fitt_range?: Record<string, string>;
    contraindications?: string[];
    review_recommendation?: string;
  }>;
  metrics: Record<string, number>;
  model_params?: Record<string, unknown>;
  status: "TRAINED" | "ACTIVE" | "ARCHIVED";
  created_at: string;
};

type TrainValues = {
  name: string;
  algorithm: ClusterAlgorithm;
  n_clusters: string | number;
};

function metricText(metrics: Record<string, number>) {
  return metrics.silhouette_score ?? "-";
}

function modelOriginText(origin?: string) {
  return origin === "bootstrap_rule_calibrated" ? "BOOTSTRAP_V1" : origin || "-";
}

function modelOriginDescription(origin?: string) {
  return origin === "bootstrap_rule_calibrated"
    ? "冷启动规则校准模型，仅用于试运行人群画像和模板匹配，不作为正式科研聚类结论。"
    : "真实样本训练模型需结合样本量、稳定性和伦理审批状态解释。";
}

function evaluationText(metrics: Record<string, number>) {
  return Number(metrics.evaluation_passed ?? 0) >= 1 ? "通过" : "未通过";
}

function firstProfile(record: ClusterModel) {
  return record.cluster_profiles?.[0];
}

function predictStrategyLabel(record: ClusterModel) {
  const explicitLabel = record.model_params?.predict_strategy_label;
  if (typeof explicitLabel === "string" && explicitLabel.trim()) return explicitLabel;
  const fallback: Record<ClusterAlgorithm, string> = {
    KMeans: "最近中心分类",
    GaussianMixture: "高斯混合模型对数似然分类",
    AgglomerativeClustering: "层次聚类投影分类",
    DBSCAN: "密度近似分类，不确定时需专家解释"
  };
  return fallback[record.algorithm];
}

function noiseLabel(record: ClusterModel) {
  const label = record.model_params?.noise_label;
  return typeof label === "string" && label.trim() ? label : record.algorithm === "DBSCAN" ? "未归类/需专家解释" : "-";
}

function clusterScatterData(models: ClusterModel[]) {
  return models.flatMap((model, modelIndex) =>
    (model.cluster_profiles ?? []).map((profile, profileIndex) => ({
      x: modelIndex + 1,
      y: profile.size,
      cluster: profile.suggested_labels[0] ?? `${model.algorithm} #${profile.cluster_id}`,
      label: `${model.name} / ${profile.suggested_labels.join("、") || `簇${profile.cluster_id}`}`,
      // Keep profiles with identical sizes separated enough for chart hit testing and tooltips.
      jitter: profileIndex
    }))
  ).map((item) => ({ ...item, x: item.x + item.jitter * 0.08 }));
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
        algorithm: values.algorithm,
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
    <AppShell role="admin" title="聚类模型管理">
        <Space direction="vertical" size={16} className="onboarding-section">
          <Alert
            type="info"
            showIcon
            message="聚类模型只用于健康画像和模板匹配，不覆盖 R0/R1/R2/R3 风险规则。"
            description="冷启动规则校准模型，仅用于试运行人群画像和模板匹配，不作为正式科研聚类结论。"
          />
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Card title="训练聚类分型模型">
            <Form
              layout="vertical"
              onFinish={train}
              initialValues={{ name: "KMeans 人群分型模型", algorithm: "KMeans", n_clusters: 3 }}
            >
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="name" label="模型名称" rules={[{ required: true, message: "请填写模型名称" }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="algorithm" label="算法" rules={[{ required: true, message: "请选择算法" }]}>
                    <Select
                      options={[
                        { label: "KMeans", value: "KMeans" },
                        { label: "DBSCAN", value: "DBSCAN" },
                        { label: "GaussianMixture", value: "GaussianMixture" },
                        { label: "AgglomerativeClustering", value: "AgglomerativeClustering" }
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
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
          <ChartCard title="分型分布">
            <ClusterScatterChart data={clusterScatterData(models)} loading={loading} />
          </ChartCard>
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
                { title: "来源", render: (_: unknown, record: ClusterModel) => modelOriginText(record.model_origin) },
                { title: "预测策略", render: (_: unknown, record: ClusterModel) => predictStrategyLabel(record) },
                { title: "未归类语义", render: (_: unknown, record: ClusterModel) => noiseLabel(record) },
                { title: "聚类数", dataIndex: "n_clusters" },
                { title: "轮廓系数", render: (_: unknown, record: ClusterModel) => metricText(record.metrics) },
                { title: "DB 指数", render: (_: unknown, record: ClusterModel) => record.metrics.davies_bouldin_score ?? "-" },
                { title: "稳定性", render: (_: unknown, record: ClusterModel) => record.metrics.cluster_stability ?? "-" },
                { title: "噪声率", render: (_: unknown, record: ClusterModel) => record.metrics.noise_rate ?? "-" },
                {
                  title: "评估",
                  render: (_: unknown, record: ClusterModel) => (
                    <Tag color={Number(record.metrics.evaluation_passed ?? 0) >= 1 ? "green" : "red"}>
                      {evaluationText(record.metrics)}
                    </Tag>
                  )
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (status: ClusterModel["status"]) => (
                    <Tag color={status === "ACTIVE" ? "green" : status === "ARCHIVED" ? "default" : "blue"}>{status}</Tag>
                  )
                },
                {
                  title: "分型解释",
                  render: (_: unknown, record: ClusterModel) => {
                    const profile = firstProfile(record);
                    if (!profile) return "-";
                    return (
                      <Space direction="vertical" size={4}>
                        <Typography.Text>{profile.explanation}</Typography.Text>
                        <Typography.Text type="secondary">{profile.core_risks?.join("、")}</Typography.Text>
                        <Typography.Text type="secondary">{profile.exercise_goals?.join("、")}</Typography.Text>
                      </Space>
                    );
                  }
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
              expandable={{
                expandedRowRender: (record) => {
                  const profile = firstProfile(record);
                  if (!profile) return <Typography.Text type="secondary">暂无簇画像。</Typography.Text>;
                  return (
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="标签">{profile.suggested_labels.join("、")}</Descriptions.Item>
                      <Descriptions.Item label="模型来源解释">{modelOriginDescription(record.model_origin)}</Descriptions.Item>
                      <Descriptions.Item label="预测策略">{predictStrategyLabel(record)}</Descriptions.Item>
                      <Descriptions.Item label="DBSCAN 未归类语义">{noiseLabel(record)}</Descriptions.Item>
                      <Descriptions.Item label="核心风险">{profile.core_risks?.join("、") || "-"}</Descriptions.Item>
                      <Descriptions.Item label="运动目标">{profile.exercise_goals?.join("、") || "-"}</Descriptions.Item>
                      <Descriptions.Item label="FITT 范围">
                        {profile.fitt_range
                          ? Object.entries(profile.fitt_range)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join("；")
                          : "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="禁忌/注意">{profile.contraindications?.join("、") || "-"}</Descriptions.Item>
                      <Descriptions.Item label="专家复核建议">{profile.review_recommendation || "-"}</Descriptions.Item>
                    </Descriptions>
                  );
                }
              }}
            />
          </Card>
          <Link to="/admin/dashboard">
            <Button>返回管理端</Button>
          </Link>
        </Space>
    </AppShell>
  );
}
