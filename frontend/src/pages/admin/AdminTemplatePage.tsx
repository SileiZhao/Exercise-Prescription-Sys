import { CheckOutlined, CloseOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Form, Input, Layout, Row, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  createExerciseAction,
  createKnowledgeDocument,
  createPrescriptionTemplate,
  listExerciseActions,
  listComplianceMaterials,
  listKnowledgeDocuments,
  reindexKnowledge,
  reviewExerciseAction,
  searchKnowledge,
  updateKnowledgeDocument,
  type AdminPayload,
  type ComplianceMaterial
} from "../../api/adminContent";

const riskOptions = ["R0", "R1", "R2", "R3"].map((value) => ({ value, label: value }));
const categoryOptions = ["有氧", "抗阻", "柔韧", "平衡", "传统功法", "康复训练"].map((value) => ({ value, label: value }));

function splitTags(value?: string): string[] {
  return value
    ? value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parseJson(value: string | undefined, fallback: AdminPayload) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as AdminPayload;
  } catch {
    return fallback;
  }
}

type ExerciseAction = {
  id: number;
  name: string;
  category: string;
  risk_level: string;
  intensity: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  suitable_tags?: string[];
  contraindication_tags?: string[];
  body_parts?: string[];
};

type KnowledgeDocument = {
  id: number;
  title: string;
  category: string;
  source: string | null;
  status: string;
  chunk_count: number;
  created_at: string;
};

type KnowledgeEvidence = {
  document_id: number;
  document_title: string;
  chunk_id: number;
  content: string;
  tags: string[];
  score: number;
};

export function AdminTemplatePage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<ExerciseAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [complianceMaterials, setComplianceMaterials] = useState<ComplianceMaterial[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<KnowledgeEvidence[]>([]);

  async function refreshActions() {
    setActionsLoading(true);
    setActionsError(null);
    try {
      setActions(await listExerciseActions());
    } catch {
      setActionsError("动作库加载失败，请检查登录状态或服务连接。");
    } finally {
      setActionsLoading(false);
    }
  }

  useEffect(() => {
    void refreshActions();
    void refreshKnowledgeDocuments();
    void refreshComplianceMaterials();
  }, []);

  async function refreshKnowledgeDocuments() {
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const data = await listKnowledgeDocuments({ page: 1, page_size: 20 });
      setKnowledgeDocuments(data.items);
    } catch {
      setKnowledgeError("知识文档加载失败，请确认管理员或专家权限。");
    } finally {
      setKnowledgeLoading(false);
    }
  }

  async function refreshComplianceMaterials() {
    try {
      setComplianceMaterials(await listComplianceMaterials());
    } catch {
      setComplianceMaterials([]);
    }
  }

  async function saveAction(values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await createExerciseAction({
        ...values,
        suitable_tags: splitTags(values.suitable_tags as string),
        contraindication_tags: splitTags(values.contraindication_tags as string),
        body_parts: splitTags(values.body_parts as string)
      });
      await refreshActions();
      setNotice("动作已导入，默认进入待专家审核状态。");
    } catch {
      setNotice("保存动作失败，请检查字段或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function reviewAction(actionId: number, status: "APPROVED" | "REJECTED") {
    setSaving(true);
    setNotice(null);
    try {
      await reviewExerciseAction(actionId, { status, comment: status === "APPROVED" ? "管理端审核通过" : "管理端驳回" });
      await refreshActions();
      setNotice(status === "APPROVED" ? "动作已批准，可进入处方模板。" : "动作已驳回。");
    } catch {
      setNotice("动作审核失败，请检查权限或稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await createPrescriptionTemplate({
        ...values,
        cluster_tags: splitTags(values.cluster_tags as string),
        goal_tags: splitTags(values.goal_tags as string),
        precautions: splitTags(values.precautions as string),
        contraindications: splitTags(values.contraindications as string),
        evidence_refs: splitTags(values.evidence_refs as string),
        fitt_vp: parseJson(values.fitt_vp as string, {
          frequency: "每周3次",
          intensity: "低—中等强度",
          time: "每次30分钟",
          type: ["快走"],
          volume: "每周90分钟",
          progression: "每2-4周根据反馈调整"
        })
      });
      setNotice("模板已保存，可用于 FITT-VP 匹配。");
    } catch {
      setNotice("保存模板失败，请检查 FITT-VP JSON 或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function saveKnowledge(values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await createKnowledgeDocument({
        ...values,
        tags: splitTags(values.tags as string)
      });
      await refreshKnowledgeDocuments();
      setNotice("知识文档已切片入库，可作为 RAG 证据来源。");
    } catch {
      setNotice("保存知识文档失败，请检查字段或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function runKnowledgeSearch(values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      const results = await searchKnowledge({
        query: values.search_query,
        tags: splitTags(values.search_tags as string),
        limit: 5
      });
      setEvidence(results);
      setNotice("知识库检索验证已完成。");
    } catch {
      setNotice("知识库检索失败，请检查问题、标签或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function updateKnowledgeStatus(documentId: number, status: "ACTIVE" | "ARCHIVED") {
    setSaving(true);
    setNotice(null);
    try {
      await updateKnowledgeDocument(documentId, {
        status,
        reason: status === "ARCHIVED" ? "管理端停用知识文档" : "管理端启用知识文档"
      });
      await refreshKnowledgeDocuments();
      setNotice(status === "ARCHIVED" ? "知识文档已停用，不再参与 RAG 检索。" : "知识文档已启用，可参与 RAG 检索。");
    } catch {
      setNotice("更新知识文档状态失败，请检查权限或稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function rebuildKnowledgeIndex() {
    setSaving(true);
    setNotice(null);
    try {
      const result = await reindexKnowledge();
      setNotice(`知识向量索引已重建：新增 ${result.indexed} 个切片，跳过 ${result.skipped} 个已索引切片。`);
      await refreshKnowledgeDocuments();
    } catch {
      setNotice("重建知识向量索引失败，请检查 Qdrant 服务或稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          模板与知识库管理
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Card className="admin-workspace">
          {notice ? (
            <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon />
          ) : null}
          <Tabs
            items={[
              {
                key: "actions",
                label: "动作库",
                children: (
                  <ActionLibraryPanel
                    actions={actions}
                    loading={actionsLoading}
                    error={actionsError}
                    saving={saving}
                    onFinish={saveAction}
                    onReview={reviewAction}
                  />
                )
              },
              {
                key: "templates",
                label: "模板库",
                children: <TemplateForm saving={saving} onFinish={saveTemplate} />
              },
              {
                key: "knowledge",
                label: "知识库",
                children: (
                  <KnowledgePanel
                    saving={saving}
                    loading={knowledgeLoading}
                    error={knowledgeError}
                    documents={knowledgeDocuments}
                    evidence={evidence}
                    onFinish={saveKnowledge}
                    onSearch={runKnowledgeSearch}
                    onUpdateStatus={updateKnowledgeStatus}
                    onReindex={rebuildKnowledgeIndex}
                  />
                )
              },
              {
                key: "compliance",
                label: "合规材料",
                children: <CompliancePanel materials={complianceMaterials} />
              }
            ]}
          />
          <Link to="/admin/dashboard">
            <Button>返回管理端</Button>
          </Link>
        </Card>
      </Layout.Content>
    </Layout>
  );
}

function CompliancePanel({ materials }: { materials: ComplianceMaterial[] }) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="当前合规材料来自 docs 专家审核草案，正式上线仍需法务、伦理和运动医学专家确认。"
      />
      <Table
        rowKey="code"
        dataSource={materials}
        pagination={false}
        locale={{ emptyText: "暂无合规材料，请先运行参考资料导入脚本。" }}
        columns={[
          { title: "编码", dataIndex: "code" },
          { title: "标题", dataIndex: "title" },
          { title: "版本", dataIndex: "version" },
          { title: "适用范围", dataIndex: "applicable_scope" },
          {
            title: "审核状态",
            dataIndex: "review_status",
            render: (status: string) => <Tag color="orange">{status}</Tag>
          },
          { title: "短提示", dataIndex: "short_notice" }
        ]}
      />
    </Space>
  );
}

function ActionLibraryPanel({
  actions,
  loading,
  error,
  saving,
  onFinish,
  onReview
}: {
  actions: ExerciseAction[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onFinish: (values: AdminPayload) => void;
  onReview: (actionId: number, status: "APPROVED" | "REJECTED") => void;
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <ActionForm saving={saving} onFinish={onFinish} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={actions}
        pagination={false}
        locale={{ emptyText: "暂无动作，请先导入动作库。" }}
        columns={[
          { title: "动作名称", dataIndex: "name" },
          { title: "类型", dataIndex: "category" },
          { title: "风险", dataIndex: "risk_level" },
          { title: "强度", dataIndex: "intensity" },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: ExerciseAction["status"]) => (
              <Tag color={status === "APPROVED" ? "green" : status === "REJECTED" ? "red" : "orange"}>{status}</Tag>
            )
          },
          {
            title: "禁忌标签",
            dataIndex: "contraindication_tags",
            render: (tags?: string[]) => (tags?.length ? tags.join("，") : "-")
          },
          {
            title: "审核",
            render: (_: unknown, record: ExerciseAction) => (
              <Space>
                <Button
                  aria-label="批准动作"
                  icon={<CheckOutlined />}
                  size="small"
                  disabled={record.status === "APPROVED"}
                  loading={saving}
                  onClick={() => onReview(record.id, "APPROVED")}
                >
                  批准动作
                </Button>
                <Button
                  aria-label="驳回动作"
                  icon={<CloseOutlined />}
                  size="small"
                  disabled={record.status === "REJECTED"}
                  loading={saving}
                  onClick={() => onReview(record.id, "REJECTED")}
                >
                  驳回
                </Button>
              </Space>
            )
          }
        ]}
      />
    </Space>
  );
}

function ActionForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={{ category: "有氧", risk_level: "R1", intensity: "低" }}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="name" label="动作名称" rules={[{ required: true, message: "请填写动作名称" }]}>
            <Input placeholder="如：快走、八段锦、弹力带划船" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="category" label="动作类型" rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="risk_level" label="适用风险等级">
            <Select options={riskOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="intensity" label="强度">
            <Select options={["低", "中", "高"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="suitable_tags" label="适宜标签">
            <Input placeholder="肥胖代谢风险型，心肺功能不足型" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="contraindication_tags" label="禁忌标签">
            <Input placeholder="膝痛，高血压，大重量" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="instructions" label="动作说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Col>
      </Row>
      <Button type="primary" htmlType="submit" loading={saving}>
        保存动作
      </Button>
    </Form>
  );
}

function TemplateForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={{ risk_level: "R1", status: "DRAFT", version: 1 }}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="risk_level" label="风险等级">
            <Select options={riskOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="cluster_tags" label="分型标签">
            <Input placeholder="肥胖代谢风险型，初级运动水平" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="goal_tags" label="目标标签">
            <Input placeholder="减脂，增强心肺" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="fitt_vp" label="FITT-VP JSON">
            <Input.TextArea rows={6} placeholder='{"frequency":"每周3次","intensity":"低强度","time":"每次30分钟","type":["快走"],"volume":"每周90分钟","progression":"每2周调整"}' />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="precautions" label="注意事项">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="contraindications" label="禁忌动作">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Space>
        <Button type="primary" htmlType="submit" loading={saving}>
          保存模板
        </Button>
      </Space>
    </Form>
  );
}

function KnowledgePanel({
  saving,
  loading,
  error,
  documents,
  evidence,
  onFinish,
  onSearch,
  onUpdateStatus,
  onReindex
}: {
  saving: boolean;
  loading: boolean;
  error: string | null;
  documents: KnowledgeDocument[];
  evidence: KnowledgeEvidence[];
  onFinish: (values: AdminPayload) => void;
  onSearch: (values: AdminPayload) => void;
  onUpdateStatus: (documentId: number, status: "ACTIVE" | "ARCHIVED") => void;
  onReindex: () => void;
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <KnowledgeForm saving={saving} onFinish={onFinish} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Card title="已入库知识文档">
        <Space style={{ marginBottom: 12 }}>
          <Button aria-label="重建向量索引" icon={<SyncOutlined />} loading={saving} onClick={onReindex}>
            重建向量索引
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={documents}
          pagination={false}
          size="small"
          locale={{ emptyText: "暂无知识文档，请先录入指南、专家共识或动作说明。" }}
          columns={[
            { title: "标题", dataIndex: "title" },
            { title: "分类", dataIndex: "category" },
            { title: "来源", dataIndex: "source", render: (value: string | null) => value ?? "-" },
            { title: "切片数", dataIndex: "chunk_count" },
            { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{value}</Tag> },
            {
              title: "操作",
              render: (_: unknown, record: KnowledgeDocument) =>
                record.status === "ACTIVE" ? (
                  <Button size="small" danger loading={saving} onClick={() => onUpdateStatus(record.id, "ARCHIVED")}>
                    停用文档
                  </Button>
                ) : (
                  <Button size="small" loading={saving} onClick={() => onUpdateStatus(record.id, "ACTIVE")}>
                    启用文档
                  </Button>
                )
            }
          ]}
        />
      </Card>
      <KnowledgeSearchForm saving={saving} onFinish={onSearch} />
      {evidence.length ? (
        <Card title="检索证据">
          <Table
            rowKey="chunk_id"
            dataSource={evidence}
            pagination={false}
            size="small"
            columns={[
              { title: "文档", dataIndex: "document_title" },
              { title: "得分", dataIndex: "score" },
              { title: "标签", dataIndex: "tags", render: (tags: string[]) => tags.join("，") },
              { title: "证据片段", dataIndex: "content" }
            ]}
          />
        </Card>
      ) : null}
    </Space>
  );
}

function KnowledgeForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={{ category: "慢病运动" }}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="category" label="知识分类">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="tags" label="检索标签">
            <Input placeholder="高血压，R2，八段锦" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="content" label="知识正文" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Col>
      </Row>
      <Button type="primary" htmlType="submit" loading={saving}>
        保存知识
      </Button>
    </Form>
  );
}

function KnowledgeSearchForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Card title="RAG 检索验证">
      <Form layout="vertical" onFinish={onFinish}>
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Form.Item name="search_query" label="检索问题" rules={[{ required: true, message: "请输入检索问题" }]}>
              <Input placeholder="如：高血压如何安排运动强度" />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="search_tags" label="证据标签">
              <Input placeholder="高血压，R2" />
            </Form.Item>
          </Col>
        </Row>
        <Button htmlType="submit" loading={saving}>
          检索验证
        </Button>
      </Form>
    </Card>
  );
}
