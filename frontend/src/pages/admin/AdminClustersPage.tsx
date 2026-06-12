import { Alert, Button, Descriptions, Drawer, Form, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listClusterModels, trainClusterModel, updateClusterModelStatus } from "../../api/clusters";
import { AppShell, ChartCard, ClinicalStatusBadge, DecisionBanner, formatStatusLabel, statusTagColor, StatusTile, WorkbenchSection } from "../../components/ProductUI";
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
  metrics?: Record<string, number>;
  model_params?: Record<string, unknown>;
  status: "TRAINED" | "ACTIVE" | "ARCHIVED";
  created_at: string;
};

type TrainValues = {
  name: string;
  algorithm: ClusterAlgorithm;
  n_clusters: string | number;
};

function modelMetrics(record: ClusterModel | null | undefined) {
  return record?.metrics ?? {};
}

function metricText(metrics: Record<string, number> | undefined) {
  return metrics?.silhouette_score ?? "-";
}

function modelOriginText(origin?: string) {
  return origin === "bootstrap_rule_calibrated" ? "冷启动规则校准模型" : origin || "-";
}

function modelOriginDescription(origin?: string) {
  return origin === "bootstrap_rule_calibrated"
    ? "冷启动规则校准模型，仅用于试运行人群画像和模板匹配，不作为正式科研聚类结论。"
    : "真实样本训练模型需结合样本量、稳定性和伦理审批状态解释。";
}

function evaluationText(metrics: Record<string, number> | undefined) {
  return Number(metrics?.evaluation_passed ?? 0) >= 1 ? "通过" : "未通过";
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

function lifecycleGroups(models: ClusterModel[], loading: boolean) {
  return [
    {
      status: "TRAINING",
      label: "训练中",
      count: loading ? 1 : 0,
      detail: loading ? "正在读取模型状态" : "当前没有训练任务",
      tone: "info"
    },
    {
      status: "TRAINED",
      label: "已训练",
      count: models.filter((model) => model.status === "TRAINED").length,
      detail: "可启用前需核对评估指标",
      tone: "warning"
    },
    {
      status: "ACTIVE",
      label: "已启用",
      count: models.filter((model) => model.status === "ACTIVE").length,
      detail: "线上用于分型解释和模板匹配",
      tone: "safe"
    },
    {
      status: "ARCHIVED",
      label: "已归档",
      count: models.filter((model) => model.status === "ARCHIVED").length,
      detail: "保留审计，不参与线上匹配",
      tone: "neutral"
    }
  ] as const;
}

export function AdminClustersPage() {
  const [models, setModels] = useState<ClusterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trainDrawerOpen, setTrainDrawerOpen] = useState(false);
  const [expandedModelIds, setExpandedModelIds] = useState<number[]>([]);
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
      setTrainDrawerOpen(false);
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
  const activeModels = models.filter((model) => model.status === "ACTIVE").length;
  const trainedModels = models.filter((model) => model.status === "TRAINED").length;
  const passedModels = models.filter((model) => Number(modelMetrics(model).evaluation_passed ?? 0) >= 1).length;

  function toggleModelDetails(modelId: number) {
    setExpandedModelIds((currentIds) => (currentIds.includes(modelId) ? currentIds.filter((id) => id !== modelId) : [modelId]));
  }

  return (
    <AppShell
      role="admin"
      title="聚类模型生命周期"
      subtitle="聚类只用于健康画像和模板匹配，不能覆盖 R0-R3 风险规则"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={activeModels ? "ready" : "degraded"} label={`启用模型 ${activeModels}`} />
          <ClinicalStatusBadge type="review" value={trainedModels ? "pending_review" : "approved"} label={`待启用 ${trainedModels}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={activeModels ? "safe" : "warning"}
            title={activeModels ? "已有启用模型，分型服务可用" : "当前没有启用聚类模型"}
            description="聚类模型只用于健康画像、分型解释和模板匹配。风险等级仍由规则引擎决定，冷启动模型不能作为正式科研聚类结论。"
            meta={
              <>
                <ClinicalStatusBadge type="readiness" value={activeModels ? "ready" : "degraded"} label={`已启用 ${activeModels}`} />
                <ClinicalStatusBadge type="review" value={trainedModels ? "pending_review" : "approved"} label={`已训练 ${trainedModels}`} />
                <ClinicalStatusBadge type="review" value={passedModels ? "approved" : "pending"} label={`评估通过 ${passedModels}`} />
              </>
            }
          />
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <div className="status-grid">
            <StatusTile label="启用模型" value={activeModels} detail="同时只能启用一个模型" tone={activeModels ? "safe" : "warning"} />
            <StatusTile label="待启用模型" value={trainedModels} detail="训练完成但未成为线上模型" tone={trainedModels ? "warning" : "neutral"} />
            <StatusTile label="评估通过" value={`${passedModels}/${models.length}`} detail="轮廓系数、稳定性等指标" tone={passedModels ? "safe" : "warning"} />
          </div>
          <WorkbenchSection title="模型训练入口" description="训练是低频治理动作，默认页面只展示模型状态、分布和版本。">
            <div className="panel-toolbar">
              <div>
                <Typography.Text strong>准备训练新的分型模型</Typography.Text>
                <Typography.Paragraph type="secondary">
                  打开后填写模型名称、算法和聚类数。训练不会改变 R0-R3 安全规则，启用前仍需核对评估指标。
                </Typography.Paragraph>
              </div>
              <Button type="primary" onClick={() => setTrainDrawerOpen(true)}>
                训练模型
              </Button>
            </div>
          </WorkbenchSection>
          <WorkbenchSection title="模型生命周期" description="训练中、已训练、已启用、已归档四态分开看，避免在版本表中找当前线上模型。">
            <div className="model-lifecycle-grid">
              {lifecycleGroups(models, loading).map((group) => (
                <div className={`model-lifecycle-card model-lifecycle-${group.tone}`} key={group.status}>
                  <span>{group.label}</span>
                  <strong>{group.count}</strong>
                  <small>{group.detail}</small>
                </div>
              ))}
            </div>
          </WorkbenchSection>
          <WorkbenchSection title="分型分布" description="用于检查模型簇规模和标签解释，不展示可识别个体字段。">
          <ChartCard
            title="分型分布"
            unit="样本"
            insight="用于观察模型分型覆盖和离群结构，不展示可识别个人信息。"
            threshold="样本不足或漂移异常时先做模型复核。"
          >
            <ClusterScatterChart data={clusterScatterData(models)} loading={loading} />
          </ChartCard>
          </WorkbenchSection>
          <WorkbenchSection title="模型版本" description="启用、归档和解释信息保留在版本列表中。">
            <Table
              className="compact-governance-table"
              rowKey="id"
              loading={loading}
              dataSource={models}
              pagination={false}
              scroll={{ x: 760 }}
              locale={{ emptyText: "暂无聚类模型，请先积累样本并训练。" }}
              columns={[
                {
                  title: "模型名称",
                  dataIndex: "name",
                  render: (name: string, record: ClusterModel) => (
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{name}</Typography.Text>
                      <Typography.Text type="secondary">{record.created_at}</Typography.Text>
                    </Space>
                  )
                },
                {
                  title: "评估",
                  render: (_: unknown, record: ClusterModel) => (
                    <Tag color={Number(modelMetrics(record).evaluation_passed ?? 0) >= 1 ? "green" : "red"}>
                      {evaluationText(record.metrics)}
                    </Tag>
                  )
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (status: ClusterModel["status"]) => (
                    <Tag color={statusTagColor(status)}>{formatStatusLabel(status, "general")}</Tag>
                  )
                },
                { title: "聚类数", dataIndex: "n_clusters" },
                {
                  title: "关键指标",
                  render: (_: unknown, record: ClusterModel) => {
                    const metrics = modelMetrics(record);
                    const noise = metrics.noise_rate;
                    return (
                      <Space direction="vertical" size={2}>
                        <Typography.Text>轮廓 {metricText(metrics)}</Typography.Text>
                        <Typography.Text type="secondary">
                          稳定 {metrics.cluster_stability ?? "-"}
                          {typeof noise === "number" ? ` / 噪声 ${noise}` : ""}
                        </Typography.Text>
                      </Space>
                    );
                  }
                },
                {
                  title: "详情",
                  render: (_: unknown, record: ClusterModel) => (
                    <Button size="small" aria-label={`查看详情 ${record.name}`} onClick={() => toggleModelDetails(record.id)}>
                      {expandedModelIds.includes(record.id) ? "收起" : "查看详情"}
                    </Button>
                  )
                }
              ]}
              expandable={{
                expandedRowRender: (record) => (
                  <ClusterModelDetail
                    record={record}
                    saving={saving}
                    onUpdateStatus={updateStatus}
                  />
                ),
                expandedRowKeys: expandedModelIds,
                showExpandColumn: false
              }}
            />
          </WorkbenchSection>
          <Link to="/admin/dashboard">
            <Button>返回管理端</Button>
          </Link>
          <Drawer
            title="训练聚类分型模型"
            width={560}
            open={trainDrawerOpen}
            onClose={() => setTrainDrawerOpen(false)}
            destroyOnClose
          >
            <TrainModelForm saving={saving} onFinish={train} />
          </Drawer>
        </Space>
    </AppShell>
  );
}

function ClusterModelDetail({
  record,
  saving,
  onUpdateStatus
}: {
  record: ClusterModel;
  saving: boolean;
  onUpdateStatus: (modelId: number, status: "ACTIVE" | "ARCHIVED") => void;
}) {
  const profile = firstProfile(record);
  const metrics = modelMetrics(record);
  return (
    <Space direction="vertical" size={12} className="cluster-model-detail">
      <Descriptions size="small" column={1}>
        <Descriptions.Item label="算法">{record.algorithm}</Descriptions.Item>
        <Descriptions.Item label="来源">{modelOriginText(record.model_origin)}</Descriptions.Item>
        <Descriptions.Item label="模型来源解释">{modelOriginDescription(record.model_origin)}</Descriptions.Item>
        <Descriptions.Item label="预测策略">{predictStrategyLabel(record)}</Descriptions.Item>
        <Descriptions.Item label="评估指标">
          轮廓 {metricText(metrics)}；稳定 {metrics.cluster_stability ?? "-"}；噪声 {metrics.noise_rate ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="DBSCAN 未归类语义">{noiseLabel(record)}</Descriptions.Item>
      </Descriptions>
      {profile ? (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="标签">{profile.suggested_labels.join("、")}</Descriptions.Item>
          <Descriptions.Item label="分型解释">{profile.explanation}</Descriptions.Item>
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
      ) : (
        <Typography.Text type="secondary">暂无簇画像。</Typography.Text>
      )}
      <Space wrap>
        <Button
          aria-label={`启用模型 ${record.name}`}
          disabled={record.status === "ACTIVE"}
          loading={saving}
          onClick={() => onUpdateStatus(record.id, "ACTIVE")}
        >
          启用模型
        </Button>
        <Button
          aria-label={`归档模型 ${record.name}`}
          disabled={record.status === "ARCHIVED"}
          loading={saving}
          onClick={() => onUpdateStatus(record.id, "ARCHIVED")}
        >
          归档模型
        </Button>
      </Space>
    </Space>
  );
}

function TrainModelForm({ saving, onFinish }: { saving: boolean; onFinish: (values: TrainValues) => void }) {
  return (
    <Form
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ name: "KMeans 人群分型模型", algorithm: "KMeans", n_clusters: 3 }}
    >
      <Form.Item name="name" label="模型名称" rules={[{ required: true, message: "请填写模型名称" }]}>
        <Input />
      </Form.Item>
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
      <Form.Item name="n_clusters" label="聚类数" rules={[{ required: true, message: "请填写聚类数" }]}>
        <Input type="number" min={2} max={8} />
      </Form.Item>
      <Alert
        className="form-alert"
        type="info"
        showIcon
        message="训练完成后模型会进入已训练状态，需在版本列表中启用后才影响分型匹配。"
      />
      <Button type="primary" htmlType="submit" loading={saving}>
        训练模型
      </Button>
    </Form>
  );
}
