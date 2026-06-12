import { CheckOutlined, CloseOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Col, Descriptions, Divider, Drawer, Form, Input, List, Row, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { AppShell, ClinicalStatusBadge, DataNote, DecisionBanner, FITTVPCard, formatStatusLabel, sanitizeDisplayText, statusTagColor, StatusTile, WorkbenchSection } from "../../components/ProductUI";

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
  return platformStatusLabels[String(status ?? "")] ?? formatStatusLabel(status, "general");
}

function joinTags(tags?: string[]) {
  return tags?.length ? tags.join("，") : "";
}

function displayText(value?: unknown) {
  return sanitizeDisplayText(value ?? "-") || "-";
}

function displayTags(tags?: string[]) {
  return tags?.length ? tags.map((tag) => sanitizeDisplayText(tag)).join("，") : "";
}

function auditItemText(log: AuditLogItem) {
  return sanitizeDisplayText(log.action);
}

function governancePayload(values: AdminPayload): AdminPayload {
  const fitt = {
    frequency: values.fitt_frequency ?? "每周3次",
    intensity: values.fitt_intensity ?? "低到中等强度",
    time: values.fitt_time ?? "每次30分钟",
    type: splitTags(values.fitt_type as string),
    volume: values.fitt_volume ?? "每周90分钟",
    progression: values.fitt_progression ?? "每2-4周根据反馈调整"
  };
  return {
    name: values.name,
    risk_level: values.risk_level,
    cluster_tags: values.cluster_tags,
    goal_tags: values.goal_tags,
    fitt_vp: JSON.stringify(fitt),
    precautions: values.precautions,
    contraindications: values.contraindications,
    evidence_refs: values.evidence_refs,
    status: values.status,
    review_status: values.review_status,
    version: values.version,
    source_version: values.source_version
  };
}

function fittValue(template: PrescriptionTemplate | null | undefined, key: string, fallback = "") {
  const value = template?.fitt_vp?.[key];
  if (Array.isArray(value)) return value.join("，");
  return value === null || value === undefined ? fallback : String(value);
}

function templateInitialValues(template?: PrescriptionTemplate | null): AdminPayload {
  return {
    name: template?.name ?? "",
    risk_level: template?.risk_level ?? "R1",
    cluster_tags: joinTags(template?.cluster_tags),
    goal_tags: joinTags(template?.goal_tags),
    fitt_frequency: fittValue(template, "frequency", "每周3次"),
    fitt_intensity: fittValue(template, "intensity", "低到中等强度"),
    fitt_time: fittValue(template, "time", "每次30分钟"),
    fitt_type: fittValue(template, "type", "快走"),
    fitt_volume: fittValue(template, "volume", "每周90分钟"),
    fitt_progression: fittValue(template, "progression", "每2-4周根据反馈调整"),
    precautions: joinTags(template?.precautions),
    contraindications: joinTags(template?.contraindications),
    evidence_refs: joinTags(template?.evidence_refs),
    status: template?.status ?? "DRAFT",
    review_status: template?.review_status ?? "EXPERT_REVIEW_DRAFT",
    version: template?.version ?? 1,
    source_version: template?.source_version ?? ""
  };
}

function GovernanceFormGroup({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="governance-form-group">
      <div className="governance-form-group-head">
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      </div>
      <div className="governance-form-grid">{children}</div>
    </section>
  );
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
          intensity: "低到中等强度",
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
  const pendingActions = actions.filter((item) => item.status === "PENDING_REVIEW").length;
  const approvedTemplates = templates.filter((item) => item.status === "APPROVED").length;
  const activeKnowledgeDocuments = knowledgeDocuments.filter((item) => item.status === "ACTIVE").length;
  const routeDecision = activeTab === "knowledge"
    ? {
        title: "知识库用于 RAG 证据召回，需保持可检索、可停用、可重建索引",
        detail: `${activeKnowledgeDocuments} 份启用文档 / ${knowledgeDocuments.length} 份总文档`,
        action: "重建知识索引"
      }
    : activeTab === "actions"
      ? {
          title: "动作库需要先审核禁忌、停止信号和适宜人群，再进入模板匹配",
          detail: `${pendingActions} 个动作待审核 / ${actions.length} 个总动作`,
          action: "导入动作"
        }
      : {
          title: "模板库控制 FITT-VP 默认结构，批准后才能参与处方匹配",
          detail: `${approvedTemplates} 个模板已批准 / ${templates.length} 个总模板`,
          action: "新建模板"
        };

  return (
    <AppShell
      role="admin"
      title={pageTitle}
      subtitle="列表、筛选、详情、编辑、版本历史和审计留痕"
      statusItems={
        <>
          <ClinicalStatusBadge type="review" value={pendingActions ? "pending_review" : "approved"} label={`动作待审 ${pendingActions}`} />
          <ClinicalStatusBadge type="readiness" value={activeKnowledgeDocuments ? "ready" : "degraded"} label={`知识启用 ${activeKnowledgeDocuments}`} />
        </>
      }
    >
      <Space direction="vertical" size={16} className="onboarding-section">
        <DecisionBanner
          tone={activeTab === "actions" && pendingActions ? "warning" : activeTab === "knowledge" && !activeKnowledgeDocuments ? "warning" : "info"}
          title={routeDecision.title}
          description={routeDecision.detail}
          meta={
            <>
              <ClinicalStatusBadge type="review" value={pendingActions ? "pending_review" : "approved"} label={`动作待审 ${pendingActions}`} />
              <ClinicalStatusBadge type="review" value={approvedTemplates ? "approved" : "pending"} label={`模板批准 ${approvedTemplates}`} />
              <ClinicalStatusBadge type="readiness" value={activeKnowledgeDocuments ? "ready" : "degraded"} label={`知识启用 ${activeKnowledgeDocuments}`} />
            </>
          }
          actions={
            <Space wrap>
              <Link to="/admin/templates">
                <Button>模板库</Button>
              </Link>
              <Link to="/admin/exercises">
                <Button>动作库</Button>
              </Link>
              <Link to="/admin/knowledge">
                <Button>知识库</Button>
              </Link>
            </Space>
          }
        />
        <div className="status-grid">
          <StatusTile label="动作库" value={`${actions.length}`} detail={`${pendingActions} 个待审核`} tone={pendingActions ? "warning" : "safe"} />
          <StatusTile label="模板库" value={`${approvedTemplates}/${templates.length}`} detail="已批准 / 全部模板" tone={approvedTemplates ? "safe" : "warning"} />
          <StatusTile label="知识库" value={`${activeKnowledgeDocuments}/${knowledgeDocuments.length}`} detail="已启用 / 全部文档" tone={activeKnowledgeDocuments ? "safe" : "warning"} />
          <StatusTile label="合规材料" value={complianceMaterials.length} detail="确认后支撑发布与审计" />
        </div>
        <WorkbenchSection
          title={pageTitle}
          description={`当前主任务：${routeDecision.action}。所有更新都会保留版本或审计线索。`}
        >
        <div className="admin-workspace">
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
        </div>
        </WorkbenchSection>
      </Space>
    </AppShell>
  );
}

function CompliancePanel({ materials }: { materials: ComplianceMaterial[] }) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Table
        className="compact-governance-table"
        rowKey="code"
        dataSource={materials}
        pagination={false}
        scroll={{ x: 760 }}
        locale={{ emptyText: "暂无合规材料，请先运行参考资料导入脚本。" }}
        columns={[
          { title: "编码", dataIndex: "code" },
          { title: "标题", dataIndex: "title" },
          {
            title: "审核状态",
            dataIndex: "review_status",
            render: (status: string) => (
              <Tag color={statusTagColor(status)}>{complianceStatusLabels[status] ?? formatStatusLabel(status, "general")}</Tag>
            )
          },
          { title: "版本", dataIndex: "version" },
          { title: "适用范围", dataIndex: "applicable_scope" }
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
  const [createOpen, setCreateOpen] = useState(false);
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
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div className="panel-toolbar">
        <div>
          <Typography.Text strong>动作审核队列</Typography.Text>
          <Typography.Paragraph type="secondary">默认只处理列表、详情和审核。新增动作放入抽屉，避免干扰审核任务。</Typography.Paragraph>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          导入动作
        </Button>
      </div>
      <Input
        aria-label="动作筛选"
        placeholder="按名称、分类、风险等级或标签筛选动作"
        value={actionFilter}
        onChange={(event) => setActionFilter(event.target.value)}
      />
      <Table
        className="compact-governance-table"
        rowKey="id"
        loading={loading}
        dataSource={filteredActions}
        pagination={{ pageSize: 8, showSizeChanger: true }}
        scroll={{ x: 820 }}
        locale={{ emptyText: "暂无动作，请先导入动作库。" }}
        onRow={(record) => ({
          onClick: () => void openActionDetail(record)
        })}
        columns={[
          {
            title: "动作名称",
            dataIndex: "name",
            render: (name: string, record: ExerciseAction) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{name}</Typography.Text>
                {record.source_exercise_id ? <Typography.Text type="secondary">{displayText(record.source_exercise_id)}</Typography.Text> : null}
              </Space>
            )
          },
          {
            title: "类型",
            dataIndex: "category",
            render: (category: string, record: ExerciseAction) => record.exercise_type || category
          },
          {
            title: "风险等级",
            dataIndex: "risk_level",
            render: (value: string) => <Tag color={value === "R3" ? "red" : value === "R2" ? "orange" : "green"}>{value}</Tag>
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: ExerciseAction["status"]) => (
              <Tag color={statusTagColor(status)}>
                {actionStatusLabels[status]}
              </Tag>
            )
          },
          {
            title: "审核线索",
            render: (_: unknown, record: ExerciseAction) => {
              const stopCount = record.stop_signals?.length ?? 0;
              const contraindicationCount = record.contraindication_tags?.length ?? 0;
              return `${contraindicationCount} 禁忌 / ${stopCount} 停止信号`;
            }
          },
          {
            title: "详情",
            render: (_: unknown, record: ExerciseAction) => (
              <Button
                aria-label="查看动作详情"
                onClick={(event) => {
                  event.stopPropagation();
                  void openActionDetail(record);
                }}
              >
                详情
              </Button>
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
        className="task-drawer"
      >
        {selectedAction ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="动作名称">{selectedAction.name}</Descriptions.Item>
              <Descriptions.Item label="英文名称">{selectedAction.name_en ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="动作类型">{selectedAction.exercise_type || selectedAction.category}</Descriptions.Item>
              <Descriptions.Item label="风险等级">{selectedAction.risk_level}</Descriptions.Item>
              <Descriptions.Item label="状态">{actionStatusLabels[selectedAction.status]}</Descriptions.Item>
              <Descriptions.Item label="适宜人群">{joinTags(selectedAction.suitable_tags) || "-"}</Descriptions.Item>
              <Descriptions.Item label="禁忌标签">{joinTags(selectedAction.contraindication_tags) || "-"}</Descriptions.Item>
              <Descriptions.Item label="停止信号">{joinTags(selectedAction.stop_signals)}</Descriptions.Item>
              <Descriptions.Item label="证据引用">{displayTags(selectedAction.evidence_refs) || "-"}</Descriptions.Item>
              <Descriptions.Item label="来源">
                {displayText(selectedAction.source)}
                {selectedAction.source_exercise_id ? ` / ${displayText(selectedAction.source_exercise_id)}` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="关节/冲击">
                {selectedAction.joint_stress_level ?? "-"} / {selectedAction.impact_level ?? "-"}
              </Descriptions.Item>
            </Descriptions>
            <div className="drawer-action-row">
              <Button
                aria-label="批准动作"
                icon={<CheckOutlined />}
                disabled={selectedAction.status === "APPROVED"}
                loading={saving}
                onClick={() => onReview(selectedAction.id, "APPROVED")}
              >
                批准动作
              </Button>
              <Button
                aria-label="驳回动作"
                icon={<CloseOutlined />}
                danger
                disabled={selectedAction.status === "REJECTED"}
                loading={saving}
                onClick={() => onReview(selectedAction.id, "REJECTED")}
              >
                驳回
              </Button>
            </div>
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
              <div className="drawer-sticky-actions">
                <Button type="primary" htmlType="submit" loading={saving}>
                  保存动作编辑
                </Button>
              </div>
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
      <Drawer title="导入动作" width={640} open={createOpen} onClose={() => setCreateOpen(false)} destroyOnClose className="task-drawer">
        <Alert className="form-alert" type="info" showIcon message="新增动作默认进入待审核状态，批准后才参与处方模板匹配。" />
        <ActionForm
          saving={saving}
          onFinish={(values) => {
            onFinish(values);
            setCreateOpen(false);
          }}
        />
      </Drawer>
    </Space>
  );
}

function ActionForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={{ category: "有氧", risk_level: "R1", intensity: "低" }}>
      <div className="governance-form-groups">
        <GovernanceFormGroup title="基础信息" description="说明动作名称、类型和适用风险等级，先确认是否适合进入动作库。">
          <Form.Item name="name" label="动作名称" rules={[{ required: true, message: "请填写动作名称" }]}>
            <Input placeholder="如：快走、八段锦、弹力带划船" />
          </Form.Item>
          <Form.Item name="category" label="动作类型" rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="risk_level" label="适用风险等级">
            <Select options={riskOptions} />
          </Form.Item>
          <Form.Item name="intensity" label="强度">
            <Select options={["低", "中", "高"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </GovernanceFormGroup>
        <GovernanceFormGroup title="关键条件" description="适宜标签、禁忌标签和停止信号决定动作能否进入处方模板。">
          <Form.Item name="suitable_tags" label="适宜标签">
            <Input placeholder="肥胖代谢风险型，心肺功能不足型" />
          </Form.Item>
          <Form.Item name="contraindication_tags" label="禁忌标签">
            <Input placeholder="膝痛，高血压，大重量" />
          </Form.Item>
          <Form.Item name="instructions" label="动作说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </GovernanceFormGroup>
      </div>
      <div className="drawer-sticky-actions">
        <Button type="primary" htmlType="submit" loading={saving}>
          保存动作
        </Button>
      </div>
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
  const [createOpen, setCreateOpen] = useState(false);
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
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div className="panel-toolbar">
        <div>
          <Typography.Text strong>模板治理列表</Typography.Text>
          <Typography.Paragraph type="secondary">先筛选和核对已批准模板；新建模板仅在需要扩展 FITT-VP 结构时打开。</Typography.Paragraph>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          新建模板
        </Button>
      </div>
      <Input
        aria-label="模板筛选"
        placeholder="按名称、风险等级、分型、目标或证据筛选模板"
        value={templateFilter}
        onChange={(event) => setTemplateFilter(event.target.value)}
      />
      <Table
        className="compact-governance-table"
        rowKey="id"
        loading={loading}
        dataSource={filteredTemplates}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 820 }}
        locale={{ emptyText: "暂无模板，请先导入处方模板库。" }}
        onRow={(record) => ({
          onClick: () => void openTemplateDetail(record)
        })}
        columns={[
          { title: "模板名称", dataIndex: "name" },
          {
            title: "风险等级",
            dataIndex: "risk_level",
            render: (value: string) => <Tag color={value === "R3" ? "red" : value === "R2" ? "orange" : "green"}>{value}</Tag>
          },
          {
            title: "匹配范围",
            render: (_: unknown, record: PrescriptionTemplate) =>
              `${record.cluster_tags?.length ?? 0} 分型 / ${record.goal_tags?.length ?? 0} 目标`
          },
          {
            title: "本平台状态",
            render: (_: unknown, record: PrescriptionTemplate) => {
              const status = record.review_status ?? record.status;
              return (
                <Tag color={statusTagColor(status)}>
                  本平台状态：{platformStatus(status)}
                </Tag>
              );
            }
          },
          {
            title: "操作",
            render: (_: unknown, record: PrescriptionTemplate) => (
              <Button
                aria-label="查看模板详情"
                onClick={(event) => {
                  event.stopPropagation();
                  void openTemplateDetail(record);
                }}
              >
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
        className="task-drawer"
      >
        {selectedTemplate ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="模板名称">{selectedTemplate.name}</Descriptions.Item>
              <Descriptions.Item label="风险等级">{selectedTemplate.risk_level}</Descriptions.Item>
              <Descriptions.Item label="分型标签">
                <Space wrap>{selectedTemplate.cluster_tags?.length ? selectedTemplate.cluster_tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : "-"}</Space>
              </Descriptions.Item>
              <Descriptions.Item label="目标标签">
                <Space wrap>{selectedTemplate.goal_tags?.length ? selectedTemplate.goal_tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : "-"}</Space>
              </Descriptions.Item>
              <Descriptions.Item label="本平台状态">
                {platformStatus(selectedTemplate.review_status ?? selectedTemplate.status)}
              </Descriptions.Item>
              <Descriptions.Item label="注意事项">{joinTags(selectedTemplate.precautions) || "-"}</Descriptions.Item>
              <Descriptions.Item label="禁忌">{joinTags(selectedTemplate.contraindications) || "-"}</Descriptions.Item>
              <Descriptions.Item label="证据引用">{displayTags(selectedTemplate.evidence_refs) || "-"}</Descriptions.Item>
            </Descriptions>
            <FITTVPCard fitt={selectedTemplate.fitt_vp} riskLevel={selectedTemplate.risk_level} />
            <Divider>编辑</Divider>
            <TemplateForm
              saving={saving}
              submitLabel="保存模板编辑"
              initialValues={templateInitialValues(selectedTemplate)}
              onFinish={(values) => onUpdate(selectedTemplate.id, governancePayload(values))}
            />
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
      <Drawer title="新建处方模板" width={720} open={createOpen} onClose={() => setCreateOpen(false)} destroyOnClose className="task-drawer">
        <Alert className="form-alert" type="info" showIcon message="模板保存后需审核批准，批准前不会参与自动处方匹配。" />
        <TemplateForm
          saving={saving}
          onFinish={(values) => {
            onFinish(governancePayload(values));
            setCreateOpen(false);
          }}
        />
      </Drawer>
    </Space>
  );
}

function TemplateForm({
  saving,
  onFinish,
  initialValues,
  submitLabel = "保存模板"
}: {
  saving: boolean;
  onFinish: (values: AdminPayload) => void;
  initialValues?: AdminPayload;
  submitLabel?: string;
}) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={initialValues ?? templateInitialValues()}>
      <div className="governance-form-groups">
        <GovernanceFormGroup title="基础信息" description="先说明模板适用的风险、分型和目标，避免从 FITT-VP 细节开始。">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="risk_level" label="风险等级">
            <Select options={riskOptions} />
          </Form.Item>
          <Form.Item name="cluster_tags" label="分型标签">
            <Input placeholder="肥胖代谢风险型，初级运动水平" />
          </Form.Item>
          <Form.Item name="goal_tags" label="目标标签">
            <Input placeholder="减脂，增强心肺" />
          </Form.Item>
        </GovernanceFormGroup>

        <GovernanceFormGroup title="FITT-VP 处方结构" description="把 JSON 拆成可读字段，保存时再自动组装为原接口需要的结构。">
          <Form.Item name="fitt_frequency" label="频率">
            <Input placeholder="每周3次" />
          </Form.Item>
          <Form.Item name="fitt_intensity" label="强度">
            <Input placeholder="低到中等强度" />
          </Form.Item>
          <Form.Item name="fitt_time" label="单次时间">
            <Input placeholder="每次30分钟" />
          </Form.Item>
          <Form.Item name="fitt_type" label="运动类型">
            <Input placeholder="快走，弹力带，八段锦" />
          </Form.Item>
          <Form.Item name="fitt_volume" label="周总量">
            <Input placeholder="每周90分钟" />
          </Form.Item>
          <Form.Item name="fitt_progression" label="进阶规则">
            <Input placeholder="每2-4周根据反馈调整" />
          </Form.Item>
        </GovernanceFormGroup>

        <GovernanceFormGroup title="安全边界与发布治理" description="禁忌、证据和平台状态决定模板是否能进入自动匹配。">
          <Form.Item name="precautions" label="注意事项">
            <Input />
          </Form.Item>
          <Form.Item name="contraindications" label="禁忌动作">
            <Input />
          </Form.Item>
          <Form.Item name="evidence_refs" label="证据引用">
            <Input placeholder="指南编号、专家共识或知识库文档" />
          </Form.Item>
          <Form.Item name="status" label="模板状态">
            <Select
              options={[
                { value: "DRAFT", label: "草稿" },
                { value: "APPROVED", label: "已批准" },
                { value: "ARCHIVED", label: "已归档" }
              ]}
            />
          </Form.Item>
          <Form.Item name="review_status" label="平台审核状态">
            <Select
              options={[
                { value: "EXPERT_REVIEW_DRAFT", label: "专家草稿" },
                { value: "APPROVED", label: "已批准" },
                { value: "EXPERT_CONFIRMED", label: "专家已确认" },
                { value: "ARCHIVED", label: "已归档" }
              ]}
            />
          </Form.Item>
        </GovernanceFormGroup>
      </div>
      <div className="drawer-sticky-actions">
        <Button type="primary" htmlType="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
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
  const [createOpen, setCreateOpen] = useState<"manual" | "upload" | "search" | null>(null);
  const activeDocuments = documents.filter((document) => document.status === "ACTIVE");
  const failedDocuments = documents.filter((document) => document.status === "INDEX_FAILED" || Boolean(document.skipped_reason));
  const totalChunks = documents.reduce((sum, document) => sum + Number(document.chunk_count ?? 0), 0);
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
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div className="panel-toolbar">
        <div>
          <Typography.Text strong>知识文档治理</Typography.Text>
          <Typography.Paragraph type="secondary">默认检查文档状态、索引和检索结果；录入和上传作为低频动作收起。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button onClick={() => setCreateOpen("manual")}>录入知识</Button>
          <Button type="primary" onClick={() => setCreateOpen("upload")}>上传文件</Button>
          <Button onClick={() => setCreateOpen("search")}>检索验证</Button>
          <Button aria-label="重建向量索引" icon={<SyncOutlined />} loading={saving} onClick={onReindex}>
            重建向量索引
          </Button>
        </Space>
      </div>
      <div className="status-grid">
        <StatusTile label="启用文档" value={`${activeDocuments.length}/${documents.length}`} detail="参与 RAG 召回" tone={activeDocuments.length ? "safe" : "warning"} />
        <StatusTile label="索引失败" value={failedDocuments.length} detail="需要重建或停用" tone={failedDocuments.length ? "danger" : "safe"} />
        <StatusTile label="已切片" value={totalChunks} detail="可召回知识片段" tone={totalChunks ? "info" : "warning"} />
        <StatusTile label="本次检索证据" value={evidence.length} detail="用于验证召回质量" />
      </div>
      {failedDocuments.length ? (
        <DataNote
          title="索引失败修复队列"
          description={failedDocuments
            .slice(0, 3)
            .map((document) => `${document.title}：${document.skipped_reason ?? "索引失败"}`)
            .join("；")}
          action={
            <Button size="small" icon={<SyncOutlined />} loading={saving} onClick={onReindex}>
              重建索引
            </Button>
          }
        />
      ) : null}
      <section className="governance-table-surface">
        <div className="governance-table-head">
          <div>
            <Typography.Text strong>已入库知识文档</Typography.Text>
            <Typography.Paragraph type="secondary">点击详情查看切片、向量化状态、版本和审计留痕。</Typography.Paragraph>
          </div>
        </div>
        <Input
          aria-label="知识筛选"
          placeholder="按标题、分类、来源、版本、状态或索引失败原因筛选知识文档"
          value={knowledgeFilter}
          onChange={(event) => setKnowledgeFilter(event.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Table
          className="compact-governance-table"
          rowKey="id"
          loading={loading}
          dataSource={filteredDocuments}
          pagination={{ pageSize: 8, showSizeChanger: true }}
          scroll={{ x: 760 }}
          size="small"
          locale={{ emptyText: "暂无知识文档，请先录入指南、专家共识或动作说明。" }}
          onRow={(record) => ({
            onClick: () => void openKnowledgeDetail(record)
          })}
          columns={[
            { title: "标题", dataIndex: "title" },
            { title: "分类", dataIndex: "category" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={statusTagColor(value)}>
                  {platformStatus(value)}
                </Tag>
              )
            },
            { title: "切片数", dataIndex: "chunk_count" },
            {
              title: "操作",
              render: (_: unknown, record: KnowledgeDocument) => (
                <Button
                  aria-label={record.status === "ACTIVE" ? "查看知识详情" : `查看${record.title}详情`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void openKnowledgeDetail(record);
                  }}
                >
                  详情
                </Button>
              )
            }
          ]}
        />
      </section>
      <Drawer
        title="知识文档详情"
        width={720}
        open={Boolean(selectedDocument)}
        onClose={() => setSelectedDocument(null)}
        destroyOnClose
        className="task-drawer"
      >
        {selectedDocument ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="文档标题">{selectedDocument.title}</Descriptions.Item>
              <Descriptions.Item label="知识分类">{selectedDocument.category}</Descriptions.Item>
              <Descriptions.Item label="来源">{displayText(selectedDocument.source)}</Descriptions.Item>
              <Descriptions.Item label="来源类型">{displayText(selectedDocument.source_type)}</Descriptions.Item>
              <Descriptions.Item label="版本">{selectedDocument.version ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="年份">{selectedDocument.published_year ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="可信度">{selectedDocument.credibility_level ?? "-"}</Descriptions.Item>
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
            <div className="drawer-sticky-actions">
              {selectedDocument.status === "ACTIVE" ? (
                <Button danger loading={saving} onClick={() => onUpdateStatus(selectedDocument.id, "ARCHIVED")}>
                  停用文档
                </Button>
              ) : (
                <Button loading={saving} onClick={() => onUpdateStatus(selectedDocument.id, "ACTIVE")}>
                  启用文档
                </Button>
              )}
            </div>
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
      {evidence.length ? (
        <section className="governance-table-surface">
          <div className="governance-table-head">
            <div>
              <Typography.Text strong>检索证据</Typography.Text>
              <Typography.Paragraph type="secondary">显示召回模式、资料状态、来源和证据片段。</Typography.Paragraph>
            </div>
          </div>
          <Table
            rowKey="chunk_id"
            dataSource={evidence}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
            columns={[
              { title: "文档", dataIndex: "document_title" },
              {
                title: "召回状态",
                render: (_: unknown, record: KnowledgeEvidence) => (
                  <Space direction="vertical" size={2}>
                    <Tag color={record.retrieval_mode === "vector" ? "green" : "orange"}>
                      {record.document_status === "INDEX_FAILED"
                        ? "索引失败资料，仅关键词召回"
                        : retrievalModeLabels[record.retrieval_mode]}
                    </Tag>
                    {record.fallback_reason ? <Typography.Text type="secondary">{displayText(record.fallback_reason)}</Typography.Text> : null}
                  </Space>
                )
              },
              {
                title: "资料状态",
                render: (_: unknown, record: KnowledgeEvidence) => (
                  <Space direction="vertical" size={2}>
                    <Tag color={statusTagColor(record.document_status)}>
                      {platformStatus(record.document_status)}
                    </Tag>
                    {record.document_skipped_reason ? (
                      <Typography.Text type="secondary">{record.document_skipped_reason}</Typography.Text>
                    ) : null}
                  </Space>
                )
              },
              {
                title: "来源定位",
                render: (_: unknown, record: KnowledgeEvidence) => (
                  <Space direction="vertical" size={2}>
                    <Typography.Text>{record.section ?? "-"}</Typography.Text>
                    <Typography.Text type="secondary">
                      {record.page_start && record.page_end ? `${record.page_start}-${record.page_end}` : "-"}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {displayText([record.source_type, record.version].filter(Boolean).join(" / ") || "-")}
                    </Typography.Text>
                  </Space>
                )
              },
              { title: "证据片段", dataIndex: "content" }
            ]}
          />
        </section>
      ) : null}
      <Drawer
        title={createOpen === "upload" ? "上传知识文件" : createOpen === "search" ? "RAG 检索验证" : "录入知识正文"}
        width={720}
        open={Boolean(createOpen)}
        onClose={() => setCreateOpen(null)}
        destroyOnClose
        className="task-drawer"
      >
        {createOpen === "upload" ? (
          <KnowledgeUploadForm
            saving={saving}
            onUpload={(payload) => {
              onUpload(payload);
              setCreateOpen(null);
            }}
          />
        ) : createOpen === "search" ? (
          <KnowledgeSearchForm
            saving={saving}
            onFinish={(values) => {
              onSearch(values);
              setCreateOpen(null);
            }}
          />
        ) : createOpen === "manual" ? (
          <KnowledgeForm
            saving={saving}
            onFinish={(values) => {
              onFinish(values);
              setCreateOpen(null);
            }}
          />
        ) : null}
      </Drawer>
    </Space>
  );
}

function KnowledgeForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <Form layout="vertical" onFinish={onFinish} initialValues={{ category: "慢病运动" }}>
      <div className="governance-form-groups">
        <GovernanceFormGroup title="基础信息" description="用于知识治理和检索过滤，建议使用清晰的指南或共识标题。">
          <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="知识分类">
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="检索标签">
            <Input placeholder="高血压，R2，八段锦" />
          </Form.Item>
        </GovernanceFormGroup>
        <GovernanceFormGroup title="预览/证据" description="正文会参与 RAG 检索，避免写入真实身份信息或未脱敏资料。">
          <Form.Item name="content" label="知识正文" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </GovernanceFormGroup>
      </div>
      <div className="drawer-sticky-actions">
        <Button type="primary" htmlType="submit" loading={saving}>
          保存知识
        </Button>
      </div>
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
    <>
      <Form
        name="knowledge-upload"
        layout="vertical"
        onFinish={submit}
        initialValues={{ upload_category: "慢病运动", upload_source_type: "上传资料" }}
      >
        <div className="governance-form-groups">
          <GovernanceFormGroup title="基础信息" description="先确认文档标题、分类和上传文件，上传后进入索引治理流程。">
            <Form.Item name="upload_title" label="上传文档标题" rules={[{ required: true, message: "请填写文档标题" }]}>
              <Input />
            </Form.Item>
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
            <Form.Item name="upload_category" label="知识分类">
              <Input />
            </Form.Item>
          </GovernanceFormGroup>
          <GovernanceFormGroup title="关键条件" description="来源、版本和可信度用于专家审核和后续证据追踪。">
            <Form.Item name="upload_source_type" label="来源类型">
              <Input />
            </Form.Item>
            <Form.Item name="upload_version" label="版本">
              <Input />
            </Form.Item>
            <Form.Item name="upload_published_year" label="年份">
              <Input />
            </Form.Item>
            <Form.Item name="upload_credibility_level" label="可信度">
              <Input />
            </Form.Item>
            <Form.Item name="upload_tags" label="检索标签">
              <Input placeholder="高血压，R2" />
            </Form.Item>
          </GovernanceFormGroup>
        </div>
        <div className="drawer-sticky-actions">
          <Button type="primary" htmlType="submit" loading={saving}>
            上传知识文件
          </Button>
        </div>
      </Form>
    </>
  );
}

function KnowledgeSearchForm({ saving, onFinish }: { saving: boolean; onFinish: (values: AdminPayload) => void }) {
  return (
    <>
      <Form layout="vertical" onFinish={onFinish}>
        <section className="drawer-field-section">
          <Typography.Text strong>基础信息</Typography.Text>
          <Typography.Paragraph type="secondary">输入脱敏问题和证据标签，仅用于验证召回质量。</Typography.Paragraph>
            <Form.Item name="search_query" label="检索问题" rules={[{ required: true, message: "请输入检索问题" }]}>
              <Input placeholder="如：高血压如何安排运动强度" />
            </Form.Item>
            <Form.Item name="search_tags" label="证据标签">
              <Input placeholder="高血压，R2" />
            </Form.Item>
        </section>
        <div className="drawer-sticky-actions">
          <Button type="primary" htmlType="submit" loading={saving}>
            检索验证
          </Button>
        </div>
      </Form>
    </>
  );
}
