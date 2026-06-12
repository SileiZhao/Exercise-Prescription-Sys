import { Alert, Button, Col, Descriptions, Divider, Drawer, Form, Input, List, Row, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";
import { createRiskRule, listRiskRules, testRiskRules, updateRiskRule, type RiskRuleItem, type RiskRulePayload } from "../../api/adminRules";
import { AppShell, ClinicalStatusBadge, DataNote, DecisionBanner, formatStatusLabel, RuleHitCard, sanitizeDisplayText, statusTagColor, StatusTile, WorkbenchSection } from "../../components/ProductUI";

const severityOptions = ["RED", "YELLOW", "GREEN"].map((value) => ({ value, label: formatStatusLabel(value, "general") }));
const opOptions = ["eq", "neq", "gt", "gte", "lt", "lte", "between", "in_any", "contains", "not_empty_restriction", "exists"].map((value) => ({ value, label: value }));
const reviewStatusOptions = [
  "EXPERT_REVIEW_DRAFT",
  "APPROVED",
  "ACTIVE",
  "DISABLED"
].map((value) => ({ value, label: formatStatusLabel(value, "review") }));

function splitTags(value?: string): string[] {
  return value
    ? value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parseJson(value: string | undefined, fallback: unknown) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRequiredJson(value: string | undefined, fieldName: string) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${fieldName}必须是合法 JSON。`);
  }
}

function formatRuleValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}:${String(item)}`)
      .join("，");
  }
  return String(value ?? "-");
}

const auditActionLabels: Record<string, string> = {
  CREATE_RISK_RULE: "新增风险规则",
  UPDATE_RISK_RULE: "更新风险规则",
  DELETE_RISK_RULE: "删除风险规则",
  TEST_RISK_RULE: "运行规则测试"
};

function auditItemText(log: AuditLogItem) {
  return auditActionLabels[log.action] ?? sanitizeDisplayText(log.action);
}

function recentHitCountLabel(rule: RiskRuleItem) {
  const ruleWithHits = rule as RiskRuleItem & {
    recent_hit_count?: number | null;
    hit_count_7d?: number | null;
  };
  const value = ruleWithHits.recent_hit_count ?? ruleWithHits.hit_count_7d;
  return typeof value === "number" ? String(value) : "待接入";
}

const opLabels: Record<string, string> = {
  eq: "等于",
  neq: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  between: "位于区间",
  in_any: "命中任一值",
  contains: "包含",
  not_empty_restriction: "存在限制说明",
  exists: "存在"
};

const fieldPathLabels: Record<string, string> = {
  "profile.bmi": "BMI",
  "fitness_test.sbp": "收缩压",
  "fitness_test.dbp": "舒张压",
  "fitness_test.pain_score": "疼痛评分",
  "fitness_test.resting_hr": "静息心率",
  "biochemical_index.fbg": "空腹血糖",
  "biochemical_index.ldl_c": "LDL-C",
  "risk_screening.chest_pain": "胸痛",
  "risk_screening.syncope": "晕厥",
  "risk_screening.abnormal_dyspnea": "异常气短"
};

function fieldPathLabel(path: unknown) {
  const value = String(path ?? "-");
  return fieldPathLabels[value] ?? value.replace(/_/g, " ");
}

function formatCondition(condition: Record<string, unknown>) {
  return `${fieldPathLabel(condition.path)} ${opLabels[String(condition.op ?? "")] ?? String(condition.op ?? "-")} ${formatRuleValue(condition.value)}`;
}

function rulePlainText(values: Partial<RiskRulePayload>) {
  const severity = String(values.severity ?? "RED");
  const path = fieldPathLabel(values.path ?? "字段路径");
  const op = String(values.op ?? "gte");
  const rawValue = values.value === undefined || values.value === "" ? "阈值" : String(values.value);
  const result = severity === "RED" ? "阻断训练或建议医学评估" : severity === "YELLOW" ? "进入谨慎执行或专家复核" : "允许继续执行";
  return `当 ${path} ${opLabels[op] ?? op} ${rawValue} 时，系统将按${formatStatusLabel(severity, "general")}规则处理：${result}。`;
}

function ruleJsonPreview(values: Partial<RiskRulePayload>) {
  return {
    code: values.code || "CUSTOM_RED_SBP",
    name: values.name || "自定义风险规则",
    severity: values.severity || "RED",
    priority: values.priority ?? 100,
    rule_type: values.rule_type || "RISK_LEVEL",
    review_status: values.review_status || "EXPERT_REVIEW_DRAFT",
    is_active: values.is_active ?? true,
    source_ref: values.source_ref || "指南、专家共识或规则库版本",
    applies_to: splitTags(values.applies_to as string | undefined),
    condition: {
      path: values.path || "fitness_test.sbp",
      op: values.op || "gte",
      value: parseJson(values.value as string | undefined, values.value || 175)
    },
    message: values.message || "命中后展示给用户和专家的安全文案",
    contraindications: splitTags(values.contraindications as string | undefined),
    intensity_cap: values.intensity_cap || null
  };
}

function ruleDisplayPreview(values: Partial<RiskRulePayload>) {
  const preview = ruleJsonPreview(values);
  return {
    ...preview,
    review_status: formatStatusLabel(String(preview.review_status), "review"),
    source_ref: sanitizeDisplayText(preview.source_ref)
  };
}

export function AdminRulesPage() {
  const [rules, setRules] = useState<RiskRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [ruleFilter, setRuleFilter] = useState("");
  const [selectedRule, setSelectedRule] = useState<RiskRuleItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [taskDrawer, setTaskDrawer] = useState<"create" | "test" | null>(null);

  const filteredRules = rules.filter((rule) => {
    const text = [
      rule.code,
      rule.name,
      rule.severity,
      rule.message,
      rule.rule_type,
      rule.source_ref,
      rule.review_status,
      formatCondition(rule.condition),
      ...(rule.contraindications ?? []),
      ...(rule.applies_to ?? [])
    ].join(" ");
    return text.toLowerCase().includes(ruleFilter.toLowerCase());
  });

  async function refreshRules() {
    setLoading(true);
    try {
      setRules(await listRiskRules());
    } catch {
      setNotice("加载风险规则失败，请确认管理员权限。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshRules();
  }, []);

  async function saveRule(values: RiskRulePayload) {
    setSaving(true);
    setNotice(null);
    try {
      const conditionValue = parseRequiredJson(values.value as string, "比较值");
      await createRiskRule({
        code: values.code,
        name: values.name,
        severity: values.severity,
        priority: Number(values.priority ?? 100),
        rule_type: values.rule_type,
        source_ref: values.source_ref,
        applies_to: splitTags(values.applies_to as string),
        review_status: values.review_status,
        message: values.message,
        condition: {
          path: values.path,
          op: values.op,
          value: conditionValue
        },
        contraindications: splitTags(values.contraindications as string),
        intensity_cap: values.intensity_cap,
        is_active: values.is_active ?? true
      });
      await refreshRules();
      setNotice("风险规则已保存并记录审计。");
    } catch (error) {
      setNotice(error instanceof Error && error.message.endsWith("必须是合法 JSON。")
        ? error.message
        : "保存风险规则失败，请检查 DSL 字段或权限。");
    } finally {
      setSaving(false);
    }
  }

  async function editRule(ruleId: number, values: RiskRulePayload) {
    setSaving(true);
    setNotice(null);
    try {
      await updateRiskRule(ruleId, {
        name: values.name ?? values.edit_name,
        severity: values.severity ?? values.edit_severity,
        priority: Number(values.priority ?? values.edit_priority ?? 100),
        rule_type: values.rule_type ?? values.edit_rule_type,
        source_ref: values.source_ref ?? values.edit_source_ref,
        applies_to: splitTags((values.applies_to ?? values.edit_applies_to) as string),
        review_status: values.review_status ?? values.edit_review_status,
        message: values.message ?? values.edit_message,
        condition: {
          path: values.path ?? values.edit_path,
          op: values.op ?? values.edit_op,
          value: parseJson((values.value ?? values.edit_value) as string, values.value ?? values.edit_value)
        },
        contraindications: splitTags((values.contraindications ?? values.edit_contraindications) as string),
        intensity_cap: values.intensity_cap ?? values.edit_intensity_cap,
        is_active: values.is_active ?? values.edit_is_active ?? true
      });
      await refreshRules();
      setNotice("风险规则已更新并记录审计日志。");
    } catch {
      setNotice("更新风险规则失败，请检查 DSL 字段或权限。");
    } finally {
      setSaving(false);
    }
  }

  async function openRuleDetail(rule: RiskRuleItem) {
    setSelectedRule(rule);
    const logs = await listAuditLogs({ resource_type: "RiskRuleConfig" });
    setAuditLogs(logs.items.filter((item) => item.resource_id === rule.code || item.resource_id === null));
  }

  async function runRuleTest(values: RiskRulePayload) {
    setSaving(true);
    setNotice(null);
    try {
      const result = await testRiskRules({
        snapshot: parseJson(values.snapshot as string, {
          profile: { bmi: 22 },
          fitness_test: { sbp: 176, dbp: 80, pain_score: 0 },
          risk_screening: { chest_pain: false, syncope: false, abnormal_dyspnea: false }
        })
      });
      setTestResult(result);
      setNotice("规则测试已完成。");
    } catch {
      setNotice("规则测试失败，请检查 JSON 快照或权限。");
    } finally {
      setSaving(false);
    }
  }
  const activeRules = rules.filter((rule) => rule.is_active).length;
  const redRules = rules.filter((rule) => rule.severity === "RED").length;
  const draftRules = rules.filter((rule) => rule.review_status === "EXPERT_REVIEW_DRAFT").length;

  return (
    <AppShell
      role="admin"
      title="风险规则构建器"
      subtitle="新增规则必须能测试、可追溯、可停用，且不能绕过 R0-R3 安全边界"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={activeRules ? "ready" : "degraded"} label={`启用 ${activeRules}`} />
          <ClinicalStatusBadge type="review" value={draftRules ? "pending_review" : "approved"} label={`草稿 ${draftRules}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={redRules ? "warning" : "info"}
            title="风险规则直接决定训练入口是否开放"
            description="新增或编辑 DSL 前，先用测试快照验证命中结果。红色规则应优先表达禁忌、停止信号、医学评估或转介条件。"
            meta={
              <>
                <ClinicalStatusBadge type="readiness" value={activeRules ? "ready" : "degraded"} label={`启用规则 ${activeRules}/${rules.length}`} />
                <ClinicalStatusBadge type="risk" value="R3" label={`红色规则 ${redRules}`} />
                <ClinicalStatusBadge type="review" value={draftRules ? "pending_review" : "approved"} label={`草稿 ${draftRules}`} />
              </>
            }
            actions={
              <Space wrap>
                <Link to="/admin/audit-logs">
                  <Button>查看审计</Button>
                </Link>
                <Link to="/admin/dashboard">
                  <Button>返回看板</Button>
                </Link>
              </Space>
            }
          />
          <div className="status-grid">
            <StatusTile label="启用规则" value={`${activeRules}/${rules.length}`} detail="停用规则不会参与判定" tone={activeRules ? "safe" : "warning"} />
            <StatusTile label="红色规则" value={redRules} detail="阻断训练或转介医学评估" tone={redRules ? "danger" : "neutral"} />
            <StatusTile label="专家草稿" value={draftRules} detail="需确认来源和命中文案" tone={draftRules ? "warning" : "safe"} />
          </div>
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <WorkbenchSection title="规则操作" description="高风险编辑动作默认收起，避免打开页面就是 DSL 和 JSON 输入框。">
            <div className="panel-toolbar">
              <div>
                <Typography.Text strong>先测试，再启用</Typography.Text>
                <Typography.Paragraph type="secondary">新增规则、测试快照都在抽屉中完成；页面主体保留规则状态和列表。</Typography.Paragraph>
              </div>
              <Space wrap>
                <Button type="primary" onClick={() => setTaskDrawer("create")}>新增规则</Button>
                <Button onClick={() => setTaskDrawer("test")}>运行规则测试</Button>
              </Space>
            </div>
            {testResult ? (
              <Alert
                className="form-alert"
                type={(testResult.risk_level as string) === "R3" ? "error" : "info"}
                showIcon
                message={`最近测试结果：${testResult.risk_level}`}
                description={
                  <Space direction="vertical" size={8}>
                    <Typography.Text strong>命中规则</Typography.Text>
                    {Array.isArray(testResult.matched_rules)
                      ? testResult.matched_rules.map((rule) => (
                          <Space direction="vertical" size={4} key={String((rule as Record<string, unknown>).code)}>
                            <RuleHitCard rule={rule as Record<string, unknown>} />
                            <Typography.Text type="secondary">
                              字段：{String((rule as Record<string, unknown>).path ?? "-")}
                            </Typography.Text>
                          </Space>
                        ))
                      : <Typography.Text type="secondary">暂无命中规则</Typography.Text>}
                  </Space>
                }
              />
            ) : null}
          </WorkbenchSection>
          <WorkbenchSection title="规则列表" description="按编码、字段、风险等级和来源检索，进入详情可编辑并查看审计。">
            <Input
              aria-label="规则筛选"
              placeholder="按编码、名称、字段、风险等级或来源筛选规则"
              value={ruleFilter}
              onChange={(event) => setRuleFilter(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <DataNote
              title="最近命中次数"
              description="当前后端规则列表尚未返回规则命中聚合字段。前端已预留“最近命中”列，后端提供 recent_hit_count 或 hit_count_7d 后会自动显示数字。"
            />
            <Table
              className="compact-governance-table"
              rowKey="id"
              loading={loading}
              dataSource={filteredRules}
              pagination={{ pageSize: 12, showSizeChanger: true }}
              scroll={{ x: 760 }}
              locale={{ emptyText: "暂无自定义风险规则" }}
              onRow={(record) => ({
                onClick: () => void openRuleDetail(record)
              })}
              columns={[
                { title: "编码", dataIndex: "code" },
                { title: "规则名称", dataIndex: "name" },
                {
                  title: "等级",
                  dataIndex: "severity",
                  render: (value: RiskRuleItem["severity"]) => <Tag color={statusTagColor(value)}>{formatStatusLabel(value, "general")}</Tag>
                },
                {
                  title: "状态",
                  dataIndex: "is_active",
                  render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
                },
                {
                  title: "最近命中",
                  render: (_: unknown, record: RiskRuleItem) => (
                    <Typography.Text type="secondary">{recentHitCountLabel(record)}</Typography.Text>
                  )
                },
                {
                  title: "详情",
                  render: (_: unknown, record: RiskRuleItem) => (
                    <Button
                      aria-label="查看规则详情"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openRuleDetail(record);
                      }}
                    >
                      详情
                    </Button>
                  )
                }
              ]}
            />
          </WorkbenchSection>
          <Drawer
            title="规则详情"
            width={760}
            open={Boolean(selectedRule)}
            onClose={() => setSelectedRule(null)}
            destroyOnClose
            className="task-drawer"
          >
            {selectedRule ? (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <section className="drawer-field-section">
                  <Typography.Text strong>基础信息</Typography.Text>
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="规则编码">{selectedRule.code}</Descriptions.Item>
                    <Descriptions.Item label="规则名称">{selectedRule.name}</Descriptions.Item>
                    <Descriptions.Item label="风险等级">{formatStatusLabel(selectedRule.severity, "general")}</Descriptions.Item>
                    <Descriptions.Item label="状态">{selectedRule.is_active ? "启用" : "停用"}</Descriptions.Item>
                  </Descriptions>
                </section>
                <section className="drawer-field-section drawer-field-section-critical">
                  <Typography.Text strong>关键条件</Typography.Text>
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="命中条件">{formatCondition(selectedRule.condition)}</Descriptions.Item>
                    <Descriptions.Item label="禁忌/限制">{selectedRule.contraindications.join("，") || "-"}</Descriptions.Item>
                    <Descriptions.Item label="来源引用">{sanitizeDisplayText(selectedRule.source_ref || "-")}</Descriptions.Item>
                  </Descriptions>
                </section>
                <section className="drawer-field-section">
                  <Typography.Text strong>规则编辑</Typography.Text>
                </section>
                <RuleForm
                  saving={saving}
                  submitLabel="保存规则编辑"
                  codeDisabled
                  initialValues={{
                    code: selectedRule.code,
                    name: selectedRule.name,
                    severity: selectedRule.severity,
                    priority: selectedRule.priority ?? 100,
                    rule_type: selectedRule.rule_type ?? "RISK_LEVEL",
                    source_ref: selectedRule.source_ref,
                    applies_to: selectedRule.applies_to?.join("，") ?? "",
                    review_status: selectedRule.review_status ?? "EXPERT_REVIEW_DRAFT",
                    message: selectedRule.message,
                    path: selectedRule.condition.path,
                    op: selectedRule.condition.op,
                    value: selectedRule.condition.value ? JSON.stringify(selectedRule.condition.value) : "",
                    contraindications: selectedRule.contraindications.join("，"),
                    intensity_cap: selectedRule.intensity_cap,
                    is_active: selectedRule.is_active
                  }}
                  onFinish={(values) => void editRule(selectedRule.id, values)}
                />
                <section className="drawer-field-section">
                  <Typography.Text strong>预览/证据</Typography.Text>
                  <Typography.Text strong>版本历史</Typography.Text>
                  <List
                    size="small"
                    dataSource={[`v${selectedRule.version} · ${selectedRule.is_active ? "启用" : "停用"}`]}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                  <Typography.Text strong>审计日志</Typography.Text>
                  <List
                    size="small"
                    dataSource={auditLogs.map(auditItemText)}
                    locale={{ emptyText: "暂无审计留痕" }}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                </section>
              </Space>
            ) : null}
          </Drawer>
          <Drawer
            title={taskDrawer === "create" ? "新增风险规则" : "运行规则测试"}
            width={760}
            open={Boolean(taskDrawer)}
            onClose={() => setTaskDrawer(null)}
            destroyOnClose
            className="task-drawer"
          >
            {taskDrawer === "create" ? (
              <RuleForm
                saving={saving}
                onFinish={(values) => {
                  void saveRule(values);
                  setTaskDrawer(null);
                }}
              />
            ) : taskDrawer === "test" ? (
              <RuleTestForm
                saving={saving}
                onFinish={(values) => {
                  void runRuleTest(values);
                  setTaskDrawer(null);
                }}
              />
            ) : null}
          </Drawer>
        </Space>
    </AppShell>
  );
}

function RuleForm({
  saving,
  onFinish,
  initialValues,
  submitLabel = "保存规则",
  codeDisabled = false
}: {
  saving: boolean;
  onFinish: (values: RiskRulePayload) => void;
  initialValues?: Partial<RiskRulePayload>;
  submitLabel?: string;
  codeDisabled?: boolean;
}) {
  const [form] = Form.useForm<RiskRulePayload>();
  const defaults: Partial<RiskRulePayload> = {
    severity: "RED",
    priority: 100,
    rule_type: "RISK_LEVEL",
    review_status: "EXPERT_REVIEW_DRAFT",
    op: "gte",
    is_active: true,
    path: "fitness_test.sbp",
    value: "175"
  };
  const previewValues = Form.useWatch([], form) as Partial<RiskRulePayload> | undefined;
  const currentValues = previewValues ?? initialValues ?? defaults;
  const previewText = rulePlainText(currentValues);
  const displayPreview = ruleDisplayPreview(currentValues);
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ ...defaults, ...initialValues }}
      className="task-form"
    >
      <div className="rule-builder-grid">
        <div>
          <section className="drawer-field-section">
            <Typography.Text strong>基础信息</Typography.Text>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="code" label="规则编码" rules={[{ required: true }]}>
                  <Input placeholder="CUSTOM_RED_SBP" disabled={codeDisabled} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="severity" label="风险等级">
                  <Select options={severityOptions} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
                  <Input type="number" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="rule_type" label="规则类型" rules={[{ required: true }]}>
                  <Input placeholder="风险分级 / 禁忌动作 / 停止信号" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="review_status" label="审核状态">
                  <Select options={reviewStatusOptions} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="source_ref" label="来源引用">
                  <Input placeholder="指南、专家共识或规则库版本" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="applies_to" label="适用人群">
                  <Input placeholder="成人，高血压，老年人" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="is_active" label="状态">
                  <Select options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} />
                </Form.Item>
              </Col>
            </Row>
          </section>
          <section className="drawer-field-section drawer-field-section-critical">
            <Typography.Text strong>关键条件</Typography.Text>
            <Row gutter={12}>
              <Col xs={24}>
                <Form.Item name="message" label="命中文案" rules={[{ required: true }]}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="path" label="字段路径" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="op" label="操作符">
                  <Select options={opOptions} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="value" label="比较值">
                  <Input placeholder='175 或 ["胰岛素"]' />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="contraindications" label="禁忌/动作限制">
                  <Input placeholder="禁止生成训练方案，避免高强度" />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="intensity_cap" label="强度上限">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
          </section>
          <div className="drawer-sticky-actions">
            <Button type="primary" htmlType="submit" loading={saving}>
              {submitLabel}
            </Button>
          </div>
        </div>
        <aside className="rule-preview-panel">
          <Typography.Text strong>自然语言解释</Typography.Text>
          <Typography.Paragraph>{previewText}</Typography.Paragraph>
          <Divider />
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="规则结果">
              <Tag color={String(currentValues.severity ?? "RED") === "RED" ? "red" : String(currentValues.severity ?? "RED") === "YELLOW" ? "orange" : "green"}>
                {formatStatusLabel(String(currentValues.severity ?? "RED"), "general")}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="编辑预览条件">
              {`编辑预览：${formatCondition(displayPreview.condition as Record<string, unknown>)}`}
            </Descriptions.Item>
            <Descriptions.Item label="审核状态">
              {displayPreview.review_status}
            </Descriptions.Item>
            <Descriptions.Item label="来源引用">
              {displayPreview.source_ref}
            </Descriptions.Item>
          </Descriptions>
          <Divider />
          <Typography.Text strong>保存前检查</Typography.Text>
          <ul>
            <li>字段路径必须来自六类健康数据快照。</li>
            <li>RED 规则应表达禁忌、停止信号或医学评估条件。</li>
            <li>比较值保存前会校验 JSON，数组或区间请使用合法 JSON。</li>
            <li>启用后会进入风险分级和处方安全边界。</li>
          </ul>
          <Alert type="warning" showIcon message="保存前建议先运行规则测试，确认命中结果符合预期。" />
        </aside>
      </div>
    </Form>
  );
}

function RuleTestForm({ saving, onFinish }: { saving: boolean; onFinish: (values: RiskRulePayload) => void }) {
  return (
    <Form
      layout="vertical"
      onFinish={onFinish}
      initialValues={{
        snapshot: JSON.stringify(
          {
            profile: { bmi: 22 },
            fitness_test: { sbp: 176, dbp: 80, pain_score: 0 },
            risk_screening: { chest_pain: false, syncope: false, abnormal_dyspnea: false }
          },
          null,
          2
        )
      }}
    >
      <section className="drawer-field-section">
        <Typography.Text strong>基础信息</Typography.Text>
        <Typography.Paragraph type="secondary">粘贴脱敏后的六类数据快照，测试不会写入生产规则。</Typography.Paragraph>
        <Form.Item name="snapshot" label="测试快照 JSON" rules={[{ required: true }]}>
          <Input.TextArea rows={12} />
        </Form.Item>
      </section>
      <div className="drawer-sticky-actions">
        <Button type="primary" htmlType="submit" loading={saving}>
          运行规则测试
        </Button>
      </div>
    </Form>
  );
}
