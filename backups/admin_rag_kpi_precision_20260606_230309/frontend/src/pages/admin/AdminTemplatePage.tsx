import { CheckOutlined, CloseOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Divider, Drawer, Form, Input, List, Row, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";
import {
  createExerciseAction,
  createKnowledgeDocument,
  createPrescriptionTemplate,
  listExerciseActions,
  listComplianceMaterials,
  listKnowledgeDocuments,
  listPrescriptionTemplates,
  reindexKnowledge,
  reviewExerciseAction,
  searchKnowledge,
  updateExerciseAction,
  updateKnowledgeDocument,
  updatePrescriptionTemplate,
  uploadKnowledgeDocument,
  type AdminPayload,
  type ComplianceMaterial
} from "../../api/adminContent";
import { AppShell, FITTVPCard } from "../../components/ProductUI";

const riskOptions = ["R0", "R1", "R2", "R3"].map((value) => ({ value, label: value }));
const categoryOptions = ["有氧", "抗阻", "柔韧", "平衡", "传统功法", "康复训练"].map((value) => ({ value, label: value }));
const actionStatusLabels: Record<ExerciseAction["status"], string> = {
  APPROVED: "已批准",
  PENDING_REVIEW: "待审核",
  REJECTED: "已驳回"
};
const complianceStatusLabels: Record<string, string> = {
  CONFIRMED: "已确认",
  DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW: "待确认"
};
const platformStatusLabels: Record<string, string> = {
  APPROVED: "已批准",
  EXPERT_CONFIRMED: "专家已确认",
  CONFIRMED: "已确认",
  ACTIVE: "已启用",
  ARCHIVED: "已归档",
  DRAFT: "待平台确认",
  INDEX_FAILED: "索引失败"
};
const retrievalModeLabels: Record<KnowledgeEvidence["retrieval_mode"], string> = {
  vector: "向量召回",
  keyword: "关键词召回",
  keyword_fallback: "关键词降级"
};

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

function platformStatus(status?: string | null) {
  return platformStatusLabels[String(status ?? "")] ?? String(status ?? "未确认");
}

function joinTags(tags?: string[]) {
  return tags?.length ? tags.join("，") : "";
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function auditItemText(log: AuditLogItem) {
  return log.action;
}

type ExerciseAction = {
  id: number;
  source?: string | null;
  source_exercise_id?: string | null;
  name: string;
  name_en?: string | null;
  category: string;
  exercise_type?: string | null;
  image_url?: string | null;
  joint_stress_level?: string | null;
  impact_level?: string | null;
  requires_equipment?: boolean;
  is_traditional_exercise?: boolean;
  risk_level: string;
  intensity: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  suitable_tags?: string[];
  contraindication_tags?: string[];
  body_parts?: string[];
  stop_signals?: string[];
  evidence_refs?: string[];
};

type KnowledgeDocument = {
  id: number;
  title: string;
  category: string;
  source: string | null;
  file_path?: string | null;
  source_type?: string | null;
  version?: string | null;
  published_year?: string | null;
  import_batch_id?: string | null;
  credibility_level?: string | null;
  skipped_reason?: string | null;
  status: string;
  chunk_count: number;
  created_at: string;
};

type PrescriptionTemplate = {
  id: number;
  template_code?: string | null;
  name: string;
  risk_level: string;
  cluster_tags?: string[];
  goal_tags?: string[];
  fitt_vp?: AdminPayload | null;
  precautions?: string[];
  contraindications?: string[];
  evidence_refs?: string[];
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  version: number;
  source_version?: string | null;
  review_status?: string;
};

type KnowledgeEvidence = {
  document_id: number;
  document_title: string;
  chunk_id: number;
  content: string;
  tags: string[];
  score: number;
  retrieval_mode: "vector" | "keyword" | "keyword_fallback";
  fallback_reason?: string | null;
  document_status: string;
  document_skipped_reason?: string | null;
  source_type?: string | null;
  version?: string | null;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  credibility_level?: string | null;
};

export function AdminTemplatePage() {
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<ExerciseAction[]>([]);
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
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
    void refreshTemplates();
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

  async function refreshTemplates() {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      setTemplates(await listPrescriptionTemplates());
    } catch {
      setTemplatesError("模板库加载失败，请检查登录状态或服务连接。");
    } finally {
      setTemplatesLoading(false);
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
      await refreshTemplates();
      setNotice("模板已保存，可用于 FITT-VP 匹配。");
    } catch {
      setNotice("保存模板失败，请检查 FITT-VP JSON 或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function editTemplate(templateId: number, values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await updatePrescriptionTemplate(templateId, {
        ...values,
        cluster_tags: splitTags(values.cluster_tags as string),
        goal_tags: splitTags(values.goal_tags as string),
        precautions: splitTags(values.precautions as string),
        contraindications: splitTags(values.contraindications as string),
        evidence_refs: splitTags(values.evidence_refs as string),
        fitt_vp: parseJson(values.fitt_vp as string, {})
      });
      await refreshTemplates();
      setNotice("模板已更新并记录审计日志。");
    } catch {
      setNotice("更新模板失败，请检查 FITT-VP JSON 或登录权限。");
    } finally {
      setSaving(false);
    }
  }

  async function editAction(actionId: number, values: AdminPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await updateExerciseAction(actionId, {
        ...values,
        suitable_tags: splitTags(values.suitable_tags as string),
        contraindication_tags: splitTags(values.contraindication_tags as string),
        stop_signals: splitTags(values.stop_signals as string),
        evidence_refs: splitTags(values.evidence_refs as string)
      });
      await refreshActions();
      setNotice("动作已更新并记录审计日志。");
    } catch {
      setNotice("更新动作失败，请检查字段或登录权限。");
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

  async function saveKnowledgeUpload(payload: FormData) {
    setSaving(true);
    setNotice(null);
    try {
      await uploadKnowledgeDocument(payload);
      await refreshKnowledgeDocuments();
      setNotice("知识文件已上传并切片入库，可作为 RAG 证据来源。");
    } catch {
      setNotice("上传知识文件失败，请检查文件、字段或登录权限。");
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

  const activeTab = location.pathname.includes("/admin/knowledge")
    ? "knowledge"
    : location.pathname.includes("/admin/exercises")
      ? "actions"
      : "templates";
  const pageTitle = activeTab === "knowledge" ? "知识库管理" : activeTab === "actions" ? "动作库管理" : "模板库管理";

  return (
    <AppShell role="admin" title={pageTitle} subtitle="列表、筛选、详情、编辑、版本历史和审计留痕">
        <Card className="admin-workspace">
          {notice ? (
            <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon />
          ) : null}
          <Tabs
            defaultActiveKey={activeTab}
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
                    onUpdate={editAction}
                  />
                )
              },
              {
                key: "templates",
                label: "模板库",
                children: (
                  <TemplateLibraryPanel
                    templates={templates}
                    loading={templatesLoading}
                    error={templatesError}
                    saving={saving}
                    onFinish={saveTemplate}
                    onUpdate={editTemplate}
                  />
                )
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
                    onUpload={saveKnowledgeUpload}
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
    </AppShell>
  );
}

function CompliancePanel({ materials }: { materials: ComplianceMaterial[] }) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
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
            render: (status: string) => (
              <Tag color={status === "CONFIRMED" ? "green" : "orange"}>{complianceStatusLabels[status] ?? status}</Tag>
            )
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
  onReview,
  onUpdate
}: {
  actions: ExerciseAction[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onFinish: (values: AdminPayload) => void;
  onReview: (actionId: number, status: "APPROVED" | "REJECTED") => void;
  onUpdate: (actionId: number, values: AdminPayload) => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ExerciseAction | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const filteredActions = actions.filter((action) => {
    const text = [action.name, action.category, action.risk_level, action.status, ...(action.suitable_tags ?? [])].join(" ");
    return text.toLowerCase().includes(actionFilter.toLowerCase());
  });

  async function openActionDetail(action: ExerciseAction) {
    setSelectedAction(action);
    const logs = await listAuditLogs({ resource_type: "ExerciseAction" });
    setAuditLogs(logs.items.filter((item) => item.resource_id === String(action.id) || item.resource_id === null));
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <ActionForm saving={saving} onFinish={onFinish} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Input
        aria-label="动作筛选"
        placeholder="按名称、分类、风险等级或标签筛选动作"
        value={actionFilter}
        onChange={(event) => setActionFilter(event.target.value)}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredActions}
        pagination={false}
        locale={{ emptyText: "暂无动作，请先导入动作库。" }}
        expandable={{
          defaultExpandAllRows: true,
          expandedRowRender: (record: ExerciseAction) => (
            <Space direction="vertical" size={8}>
              <Typography.Text>适宜人群：{record.suitable_tags?.length ? record.suitable_tags.join("，") : "-"}</Typography.Text>
              <Typography.Text>
                禁忌人群：{record.contraindication_tags?.length ? record.contraindication_tags.join("，") : "-"}
              </Typography.Text>
              <Typography.Text>停止信号：{record.stop_signals?.length ? record.stop_signals.join("，") : "-"}</Typography.Text>
              <Typography.Text>证据引用：{record.evidence_refs?.length ? record.evidence_refs.join("，") : "-"}</Typography.Text>
              <Typography.Text>
                来源：{record.source ?? "-"}
                {record.source_exercise_id ? ` / ${record.source_exercise_id}` : ""}
              </Typography.Text>
            </Space>
          )
        }}
        columns={[
          {
            title: "动作名称",
            dataIndex: "name",
            render: (name: string, record: ExerciseAction) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{name}</Typography.Text>
                {record.name_en ? <Typography.Text type="secondary">{record.name_en}</Typography.Text> : null}
              </Space>
            )
          },
          {
            title: "类型",
            dataIndex: "category",
            render: (category: string, record: ExerciseAction) => record.exercise_type || category
          },
          { title: "风险等级", dataIndex: "risk_level" },
          { title: "冲击等级", dataIndex: "impact_level", render: (value?: string | null) => value || "-" },
          { title: "关节压力", dataIndex: "joint_stress_level", render: (value?: string | null) => value || "-" },
          {
            title: "传统功法",
            dataIndex: "is_traditional_exercise",
            render: (value?: boolean) => <Tag color={value ? "green" : "default"}>{value ? "是" : "否"}</Tag>
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: ExerciseAction["status"]) => (
              <Tag color={status === "APPROVED" ? "green" : status === "REJECTED" ? "red" : "orange"}>
                {actionStatusLabels[status]}
              </Tag>
            )
          },
          {
            title: "禁忌标签",
            dataIndex: "contraindication_tags",
            render: (tags?: string[]) => (tags?.length ? tags.join("，") : "-")
          },
          {
            title: "适宜人群",
            dataIndex: "suitable_tags",
            render: (tags?: string[]) => (tags?.length ? tags.join("，") : "-")
          },
          {
            title: "停止信号",
            dataIndex: "stop_signals",
            render: (signals?: string[]) => (signals?.length ? signals.join("，") : "-")
          },
          {
            title: "证据引用",
            dataIndex: "evidence_refs",
            render: (refs?: string[]) => (refs?.length ? refs.join("，") : "-")
          },
          {
            title: "审核",
            render: (_: unknown, record: ExerciseAction) => (
              <Space>
                <Button aria-label="查看动作详情" size="small" onClick={() => void openActionDetail(record)}>
                  详情
                </Button>
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
      <Drawer
        title="动作详情"
        width={720}
        open={Boolean(selectedAction)}
        onClose={() => setSelectedAction(null)}
        destroyOnClose
      >
        {selectedAction ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="动作名称">{selectedAction.name}</Descriptions.Item>
              <Descriptions.Item label="风险等级">{selectedAction.risk_level}</Descriptions.Item>
              <Descriptions.Item label="状态">{actionStatusLabels[selectedAction.status]}</Descriptions.Item>
              <Descriptions.Item label="停止信号">{joinTags(selectedAction.stop_signals)}</Descriptions.Item>
            </Descriptions>
            <Divider>编辑</Divider>
            <Form
              layout="vertical"
              initialValues={{
                name: selectedAction.name,
                category: selectedAction.category,
                risk_level: selectedAction.risk_level,
                intensity: selectedAction.intensity,
                suitable_tags: joinTags(selectedAction.suitable_tags),
                contraindication_tags: joinTags(selectedAction.contraindication_tags),
                stop_signals: joinTags(selectedAction.stop_signals),
                evidence_refs: joinTags(selectedAction.evidence_refs)
              }}
              onFinish={(values) => onUpdate(selectedAction.id, values)}
            >
              <Form.Item name="name" label="编辑动作名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="category" label="动作类型">
                    <Select options={categoryOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="risk_level" label="风险等级">
                    <Select options={riskOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="suitable_tags" label="适宜标签">
                <Input />
              </Form.Item>
              <Form.Item name="contraindication_tags" label="禁忌标签">
                <Input />
              </Form.Item>
              <Form.Item name="stop_signals" label="停止信号">
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存动作编辑
              </Button>
            </Form>
            <Divider>版本历史</Divider>
            <List size="small" dataSource={[`当前版本 · ${actionStatusLabels[selectedAction.status]}`]} renderItem={(item) => <List.Item>{item}</List.Item>} />
            <Divider>审计日志</Divider>
            <List
              size="small"
              dataSource={auditLogs.map(auditItemText)}
              locale={{ emptyText: "暂无审计留痕" }}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Space>
        ) : null}
      </Drawer>
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

function TemplateLibraryPanel({
  templates,
  loading,
  error,
  saving,
  onFinish,
  onUpdate
}: {
  templates: PrescriptionTemplate[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onFinish: (values: AdminPayload) => void;
  onUpdate: (templateId: number, values: AdminPayload) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<PrescriptionTemplate | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [templateFilter, setTemplateFilter] = useState("");
  const filteredTemplates = templates.filter((template) => {
    const text = [
      template.name,
      template.risk_level,
      template.status,
      template.review_status,
      ...(template.cluster_tags ?? []),
      ...(template.goal_tags ?? []),
      ...(template.evidence_refs ?? [])
    ].join(" ");
    return text.toLowerCase().includes(templateFilter.toLowerCase());
  });

  async function openTemplateDetail(template: PrescriptionTemplate) {
    setSelectedTemplate(template);
    const logs = await listAuditLogs({ resource_type: "PrescriptionTemplate" });
    setAuditLogs(logs.items.filter((item) => item.resource_id === String(template.id) || item.resource_id === null));
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <TemplateForm saving={saving} onFinish={onFinish} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Input
        aria-label="模板筛选"
        placeholder="按名称、风险等级、分型、目标或证据筛选模板"
        value={templateFilter}
        onChange={(event) => setTemplateFilter(event.target.value)}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredTemplates}
        pagination={false}
        locale={{ emptyText: "暂无模板，请先导入处方模板库。" }}
        expandable={{
          expandedRowKeys: filteredTemplates.map((item) => item.id),
          expandedRowRender: (record: PrescriptionTemplate) => (
            <Space direction="vertical" size={8}>
              <FITTVPCard fitt={record.fitt_vp} riskLevel={record.risk_level} />
              <Typography.Text>注意事项：{record.precautions?.length ? record.precautions.join("，") : "-"}</Typography.Text>
              <Typography.Text>
                禁忌：{record.contraindications?.length ? record.contraindications.join("，") : "-"}
              </Typography.Text>
              <Typography.Text>证据引用：{record.evidence_refs?.length ? record.evidence_refs.join("，") : "-"}</Typography.Text>
              <Typography.Text>本平台状态：{platformStatus(record.review_status ?? record.status)}</Typography.Text>
            </Space>
          )
        }}
        columns={[
          { title: "模板名称", dataIndex: "name" },
          { title: "风险等级", dataIndex: "risk_level" },
          {
            title: "分型标签",
            dataIndex: "cluster_tags",
            render: (tags?: string[]) => (
              <Space wrap>{tags?.length ? tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : "-"}</Space>
            )
          },
          {
            title: "目标标签",
            dataIndex: "goal_tags",
            render: (tags?: string[]) => (
              <Space wrap>{tags?.length ? tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : "-"}</Space>
            )
          },
          { title: "版本", dataIndex: "version" },
          {
            title: "本平台状态",
            render: (_: unknown, record: PrescriptionTemplate) => {
              const status = record.review_status ?? record.status;
              return (
                <Tag color={status === "APPROVED" || status === "EXPERT_CONFIRMED" ? "green" : "orange"}>
                  本平台状态：{platformStatus(status)}
                </Tag>
              );
            }
          },
          {
            title: "证据引用",
            dataIndex: "evidence_refs",
            render: (refs?: string[]) => (refs?.length ? refs.join("，") : "-")
          },
          {
            title: "操作",
            render: (_: unknown, record: PrescriptionTemplate) => (
              <Button aria-label="查看模板详情" size="small" onClick={() => void openTemplateDetail(record)}>
                详情
              </Button>
            )
          }
        ]}
      />
      <Drawer
        title="模板详情"
        width={760}
        open={Boolean(selectedTemplate)}
        onClose={() => setSelectedTemplate(null)}
        destroyOnClose
      >
        {selectedTemplate ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="模板名称">{selectedTemplate.name}</Descriptions.Item>
              <Descriptions.Item label="风险等级">{selectedTemplate.risk_level}</Descriptions.Item>
              <Descriptions.Item label="分型标签">{joinTags(selectedTemplate.cluster_tags) || "-"}</Descriptions.Item>
              <Descriptions.Item label="目标标签">{joinTags(selectedTemplate.goal_tags) || "-"}</Descriptions.Item>
              <Descriptions.Item label="本平台状态">
                {platformStatus(selectedTemplate.review_status ?? selectedTemplate.status)}
              </Descriptions.Item>
            </Descriptions>
            <FITTVPCard fitt={selectedTemplate.fitt_vp} riskLevel={selectedTemplate.risk_level} />
            <Divider>编辑</Divider>
            <Form
              layout="vertical"
              initialValues={{
                edit_name: selectedTemplate.name,
                edit_risk_level: selectedTemplate.risk_level,
                edit_cluster_tags: joinTags(selectedTemplate.cluster_tags),
                edit_goal_tags: joinTags(selectedTemplate.goal_tags),
                edit_fitt_vp: stringifyJson(selectedTemplate.fitt_vp),
                edit_precautions: joinTags(selectedTemplate.precautions),
                edit_contraindications: joinTags(selectedTemplate.contraindications),
                edit_evidence_refs: joinTags(selectedTemplate.evidence_refs),
                edit_status: selectedTemplate.status,
                edit_review_status: selectedTemplate.review_status
              }}
              onFinish={(values) =>
                onUpdate(selectedTemplate.id, {
                  name: values.edit_name,
                  risk_level: values.edit_risk_level,
                  cluster_tags: values.edit_cluster_tags,
                  goal_tags: values.edit_goal_tags,
                  fitt_vp: values.edit_fitt_vp,
                  precautions: values.edit_precautions,
                  contraindications: values.edit_contraindications,
                  evidence_refs: values.edit_evidence_refs,
                  status: values.edit_status,
                  review_status: values.edit_review_status
                })
              }
            >
              <Form.Item name="edit_name" label="编辑模板名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="edit_risk_level" label="风险等级">
                    <Select options={riskOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="edit_status" label="启用状态">
                    <Select
                      options={[
                        { value: "DRAFT", label: "草稿" },
                        { value: "APPROVED", label: "已批准" },
                        { value: "ARCHIVED", label: "已归档" }
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="edit_cluster_tags" label="分型标签">
                <Input />
              </Form.Item>
              <Form.Item name="edit_goal_tags" label="目标标签">
                <Input />
              </Form.Item>
              <Form.Item name="edit_fitt_vp" label="FITT-VP JSON">
                <Input.TextArea rows={6} />
              </Form.Item>
              <Form.Item name="edit_precautions" label="注意事项">
                <Input />
              </Form.Item>
              <Form.Item name="edit_contraindications" label="禁忌动作">
                <Input />
              </Form.Item>
              <Form.Item name="edit_evidence_refs" label="证据引用">
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存模板编辑
              </Button>
            </Form>
            <Divider>版本历史</Divider>
            <List
              size="small"
              dataSource={[
                `v${selectedTemplate.version} · ${platformStatus(selectedTemplate.review_status ?? selectedTemplate.status)}`,
                ...(selectedTemplate.version > 1 ? [`v${selectedTemplate.version - 1} · 历史版本`] : [])
              ]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
            <Divider>审计日志</Divider>
            <List
              size="small"
              dataSource={auditLogs.map(auditItemText)}
              locale={{ emptyText: "暂无审计留痕" }}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Space>
        ) : null}
      </Drawer>
    </Space>
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
  onUpload,
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
  onUpload: (payload: FormData) => void;
  onSearch: (values: AdminPayload) => void;
  onUpdateStatus: (documentId: number, status: "ACTIVE" | "ARCHIVED") => void;
  onReindex: () => void;
}) {
  const [knowledgeFilter, setKnowledgeFilter] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const filteredDocuments = documents.filter((document) => {
    const text = [
      document.title,
      document.category,
      document.source,
      document.source_type,
      document.version,
      document.published_year,
      document.status,
      document.skipped_reason
    ].join(" ");
    return text.toLowerCase().includes(knowledgeFilter.toLowerCase());
  });

  async function openKnowledgeDetail(document: KnowledgeDocument) {
    setSelectedDocument(document);
    const logs = await listAuditLogs({ resource_type: "KnowledgeDocument" });
    setAuditLogs(logs.items.filter((item) => item.resource_id === String(document.id) || item.resource_id === null));
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <KnowledgeForm saving={saving} onFinish={onFinish} />
      <KnowledgeUploadForm saving={saving} onUpload={onUpload} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Card title="已入库知识文档">
        <Space style={{ marginBottom: 12 }}>
          <Button aria-label="重建向量索引" icon={<SyncOutlined />} loading={saving} onClick={onReindex}>
            重建向量索引
          </Button>
        </Space>
        <Input
          aria-label="知识筛选"
          placeholder="按标题、分类、来源、版本、状态或索引失败原因筛选知识文档"
          value={knowledgeFilter}
          onChange={(event) => setKnowledgeFilter(event.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredDocuments}
          pagination={false}
          size="small"
          locale={{ emptyText: "暂无知识文档，请先录入指南、专家共识或动作说明。" }}
          columns={[
            { title: "标题", dataIndex: "title" },
            { title: "分类", dataIndex: "category" },
            { title: "来源", dataIndex: "source", render: (value: string | null) => value ?? "-" },
            { title: "来源类型", dataIndex: "source_type", render: (value: string | null) => value ?? "-" },
            {
              title: "版本",
              render: (_: unknown, record: KnowledgeDocument) =>
                record.version && record.version !== record.published_year ? record.version : "-"
            },
            { title: "年份", dataIndex: "published_year", render: (value: string | null) => value ?? "-" },
            { title: "可信度", dataIndex: "credibility_level", render: (value: string | null) => value ?? "-" },
            { title: "切片数", dataIndex: "chunk_count" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={value === "ACTIVE" ? "green" : value === "INDEX_FAILED" ? "red" : "default"}>
                  {platformStatus(value)}
                </Tag>
              )
            },
            { title: "索引失败原因", dataIndex: "skipped_reason", render: (value?: string | null) => value || "-" },
            {
              title: "操作",
              render: (_: unknown, record: KnowledgeDocument) => (
                <Space>
                  <Button
                    aria-label={record.status === "ACTIVE" ? "查看知识详情" : `查看${record.title}详情`}
                    size="small"
                    onClick={() => void openKnowledgeDetail(record)}
                  >
                    详情
                  </Button>
                  {record.status === "ACTIVE" ? (
                    <Button size="small" danger loading={saving} onClick={() => onUpdateStatus(record.id, "ARCHIVED")}>
                      停用文档
                    </Button>
                  ) : (
                    <Button size="small" loading={saving} onClick={() => onUpdateStatus(record.id, "ACTIVE")}>
                      启用文档
                    </Button>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Drawer
        title="知识文档详情"
        width={720}
        open={Boolean(selectedDocument)}
        onClose={() => setSelectedDocument(null)}
        destroyOnClose
      >
        {selectedDocument ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="文档标题">{selectedDocument.title}</Descriptions.Item>
              <Descriptions.Item label="知识分类">{selectedDocument.category}</Descriptions.Item>
              <Descriptions.Item label="来源">{selectedDocument.source ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="状态">{platformStatus(selectedDocument.status)}</Descriptions.Item>
              <Descriptions.Item label="切片状态">
                {selectedDocument.chunk_count > 0 ? `已切片 ${selectedDocument.chunk_count} 段` : "未完成切片"}
              </Descriptions.Item>
              <Descriptions.Item label="向量化状态">
                {selectedDocument.status === "ACTIVE"
                  ? "向量化完成"
                  : selectedDocument.status === "INDEX_FAILED"
                    ? "索引失败资料，仅关键词召回"
                    : "待向量化"}
              </Descriptions.Item>
              {selectedDocument.status === "INDEX_FAILED" || selectedDocument.skipped_reason ? (
                <Descriptions.Item label="索引失败原因">{selectedDocument.skipped_reason ?? "未记录原因"}</Descriptions.Item>
              ) : null}
              <Descriptions.Item label="文件路径">{selectedDocument.file_path ?? "-"}</Descriptions.Item>
            </Descriptions>
            <Divider>版本历史</Divider>
            <List
              size="small"
              dataSource={[
                `${selectedDocument.version ?? selectedDocument.published_year ?? "-"} · ${
                  selectedDocument.source_type ?? selectedDocument.source ?? "资料"
                }`
              ]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
            <Divider>审计日志</Divider>
            <List
              size="small"
              dataSource={auditLogs.map(auditItemText)}
              locale={{ emptyText: "暂无审计留痕" }}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Space>
        ) : null}
      </Drawer>
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
              {
                title: "检索模式",
                render: (_: unknown, record: KnowledgeEvidence) => (
                  <Space direction="vertical" size={2}>
                    <Tag color={record.retrieval_mode === "vector" ? "green" : "orange"}>
                      {record.document_status === "INDEX_FAILED"
                        ? "索引失败资料，仅关键词召回"
                        : retrievalModeLabels[record.retrieval_mode]}
                    </Tag>
                    {record.fallback_reason ? <Typography.Text type="secondary">{record.fallback_reason}</Typography.Text> : null}
                  </Space>
                )
              },
              {
                title: "资料状态",
                render: (_: unknown, record: KnowledgeEvidence) => (
                  <Space direction="vertical" size={2}>
                    <Tag color={record.document_status === "ACTIVE" ? "green" : "red"}>
                      {platformStatus(record.document_status)}
                    </Tag>
                    {record.document_skipped_reason ? (
                      <Typography.Text type="secondary">{record.document_skipped_reason}</Typography.Text>
                    ) : null}
                  </Space>
                )
              },
              { title: "章节", dataIndex: "section", render: (value: string | null) => value ?? "-" },
              {
                title: "页码",
                render: (_: unknown, record: KnowledgeEvidence) =>
                  record.page_start && record.page_end ? `${record.page_start}-${record.page_end}` : "-"
              },
              { title: "来源", render: (_: unknown, record: KnowledgeEvidence) => [record.source_type, record.version].filter(Boolean).join(" / ") || "-" },
              { title: "可信度", dataIndex: "credibility_level", render: (value: string | null) => value ?? "-" },
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

function KnowledgeUploadForm({ saving, onUpload }: { saving: boolean; onUpload: (payload: FormData) => void }) {
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function submit(values: AdminPayload) {
    const selectedFile = inputRef.current?.files?.[0] ?? fileRef.current;
    if (!selectedFile) {
      return;
    }
    const payload = new FormData();
    payload.append("file", selectedFile);
    payload.append("title", String(values.upload_title ?? ""));
    payload.append("category", String(values.upload_category ?? "慢病运动"));
    payload.append("tags", String(values.upload_tags ?? ""));
    payload.append("source", String(values.upload_source ?? selectedFile.name));
    payload.append("source_type", String(values.upload_source_type ?? "上传资料"));
    payload.append("version", String(values.upload_version ?? ""));
    payload.append("published_year", String(values.upload_published_year ?? ""));
    payload.append("credibility_level", String(values.upload_credibility_level ?? ""));
    onUpload(payload);
  }

  return (
    <Card title="文件上传">
      <Form
        name="knowledge-upload"
        layout="vertical"
        onFinish={submit}
        initialValues={{ upload_category: "慢病运动", upload_source_type: "上传资料" }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="upload_title" label="上传文档标题" rules={[{ required: true, message: "请填写文档标题" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="上传知识文件" required>
              <input
                aria-label="上传知识文件"
                ref={inputRef}
                type="file"
                accept=".txt,.md,.csv,.json,text/plain,text/markdown,application/json,text/csv"
                onChange={(event) => {
                  const nextFile = event.currentTarget.files?.[0] ?? null;
                  fileRef.current = nextFile;
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_category" label="知识分类">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_source_type" label="来源类型">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_version" label="版本">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_published_year" label="年份">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_credibility_level" label="可信度">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="upload_tags" label="检索标签">
              <Input placeholder="高血压，R2" />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={saving}>
          上传知识文件
        </Button>
      </Form>
    </Card>
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
