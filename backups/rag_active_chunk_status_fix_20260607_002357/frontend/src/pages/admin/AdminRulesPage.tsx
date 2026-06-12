import { Alert, Button, Card, Col, Descriptions, Divider, Drawer, Form, Input, List, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";
import { createRiskRule, listRiskRules, testRiskRules, updateRiskRule, type RiskRuleItem, type RiskRulePayload } from "../../api/adminRules";
import { AppShell, RuleHitCard } from "../../components/ProductUI";

const severityOptions = ["RED", "YELLOW", "GREEN"].map((value) => ({ value, label: value }));
const opOptions = ["eq", "neq", "gt", "gte", "lt", "lte", "between", "in_any", "contains", "not_empty_restriction", "exists"].map((value) => ({ value, label: value }));
const reviewStatusOptions = [
  "EXPERT_REVIEW_DRAFT",
  "APPROVED",
  "ACTIVE",
  "DISABLED"
].map((value) => ({ value, label: value }));

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

function formatCondition(condition: Record<string, unknown>) {
  return `${String(condition.path ?? "-")} ${String(condition.op ?? "-")} ${formatRuleValue(condition.value)}`;
}

function auditItemText(log: AuditLogItem) {
  return log.action;
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
      const conditionValue = parseRequiredJson(values.edit_value as string, "编辑比较值");
      await updateRiskRule(ruleId, {
        name: values.edit_name,
        severity: values.edit_severity,
        priority: Number(values.edit_priority ?? 100),
        rule_type: values.edit_rule_type,
        source_ref: values.edit_source_ref,
        applies_to: splitTags(values.edit_applies_to as string),
        review_status: values.edit_review_status,
        message: values.edit_message,
        condition: {
          path: values.edit_path,
          op: values.edit_op,
          value: conditionValue
        },
        contraindications: splitTags(values.edit_contraindications as string),
        intensity_cap: values.edit_intensity_cap,
        is_active: values.edit_is_active ?? true
      });
      await refreshRules();
      setNotice("风险规则已更新并记录审计日志。");
    } catch (error) {
      setNotice(error instanceof Error && error.message.endsWith("必须是合法 JSON。")
        ? error.message
        : "更新风险规则失败，请检查 DSL 字段或权限。");
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

  return (
    <AppShell role="admin" title="风险规则管理">
        <Space direction="vertical" size={16} className="onboarding-section">
          {notice ? <Alert type={notice.includes("失败") || notice.includes("必须是合法 JSON") ? "error" : "success"} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>全局审计日志</Button>
            </Link>
          </Space>
          <Row gutter={[16, 16]} className="admin-rules-workbench" data-testid="admin-rules-workbench">
            <Col xs={24} lg={11}>
              <Card title="规则基础配置">
                <RuleForm saving={saving} onFinish={saveRule} />
              </Card>
            </Col>
            <Col xs={24} lg={13}>
              <Card title="JSON / 测试区">
                <RuleTestForm saving={saving} onFinish={runRuleTest} />
                {testResult ? (
                  <Alert
                    className="form-alert"
                    type={(testResult.risk_level as string) === "R3" ? "error" : "info"}
                    showIcon
                    message={`测试结果：${testResult.risk_level}`}
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
              </Card>
            </Col>
          </Row>
          <Card title="规则列表">
            <Input
              aria-label="规则筛选"
              placeholder="按编码、名称、字段、风险等级或来源筛选规则"
              value={ruleFilter}
              onChange={(event) => setRuleFilter(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="id"
              loading={loading}
              dataSource={filteredRules}
              pagination={false}
              scroll={{ x: 960 }}
              locale={{ emptyText: "暂无自定义风险规则" }}
              columns={[
                { title: "编码", dataIndex: "code" },
                { title: "规则名称", dataIndex: "name" },
                {
                  title: "等级",
                  dataIndex: "severity",
                  render: (value: RiskRuleItem["severity"]) => <Tag color={value === "RED" ? "red" : value === "YELLOW" ? "orange" : "green"}>{value}</Tag>
                },
                {
                  title: "条件",
                  dataIndex: "condition",
                  render: (value: Record<string, unknown>) => formatCondition(value)
                },
                {
                  title: "状态",
                  dataIndex: "is_active",
                  render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
                },
                { title: "版本", dataIndex: "version" },
                {
                  title: "操作",
                  render: (_: unknown, record: RiskRuleItem) => (
                    <Tooltip title="查看规则详情">
                      <Button aria-label="查看规则详情" size="small" icon={<Eye size={14} />} onClick={() => void openRuleDetail(record)} />
                    </Tooltip>
                  )
                }
              ]}
            />
          </Card>
          <Drawer
            title="规则详情"
            width={760}
            open={Boolean(selectedRule)}
            onClose={() => setSelectedRule(null)}
            destroyOnClose
          >
            {selectedRule ? (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="规则编码">{selectedRule.code}</Descriptions.Item>
                  <Descriptions.Item label="规则名称">{selectedRule.name}</Descriptions.Item>
                  <Descriptions.Item label="风险等级">{selectedRule.severity}</Descriptions.Item>
                  <Descriptions.Item label="条件">{formatCondition(selectedRule.condition)}</Descriptions.Item>
                  <Descriptions.Item label="状态">{selectedRule.is_active ? "启用" : "停用"}</Descriptions.Item>
                </Descriptions>
                <Divider>编辑</Divider>
                <Form
                  layout="vertical"
                  initialValues={{
                    edit_name: selectedRule.name,
                    edit_severity: selectedRule.severity,
                    edit_priority: selectedRule.priority ?? 100,
                    edit_rule_type: selectedRule.rule_type ?? "RISK_LEVEL",
                    edit_source_ref: selectedRule.source_ref,
                    edit_applies_to: selectedRule.applies_to?.join("，") ?? "",
                    edit_review_status: selectedRule.review_status ?? "EXPERT_REVIEW_DRAFT",
                    edit_message: selectedRule.message,
                    edit_path: selectedRule.condition.path,
                    edit_op: selectedRule.condition.op,
                    edit_value: selectedRule.condition.value ? JSON.stringify(selectedRule.condition.value) : "",
                    edit_contraindications: selectedRule.contraindications.join("，"),
                    edit_intensity_cap: selectedRule.intensity_cap,
                    edit_is_active: selectedRule.is_active
                  }}
                  onFinish={(values) => editRule(selectedRule.id, values)}
                >
                  <Form.Item name="edit_name" label="编辑规则名称" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name="edit_severity" label="风险等级">
                        <Select options={severityOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="edit_is_active" label="启用/停用">
                        <Select options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name="edit_path" label="字段路径">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="edit_op" label="操作符">
                        <Select options={opOptions} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="edit_value" label="编辑比较值">
                    <Input />
                  </Form.Item>
                  <Form.Item name="edit_message" label="命中文案">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Form.Item name="edit_contraindications" label="禁忌/动作限制">
                    <Input />
                  </Form.Item>
                  <Form.Item name="edit_intensity_cap" label="强度上限">
                    <Input />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    保存规则编辑
                  </Button>
                </Form>
                <Divider>版本历史</Divider>
                <List
                  size="small"
                  dataSource={[`v${selectedRule.version} · ${selectedRule.is_active ? "启用" : "停用"}`]}
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
    </AppShell>
  );
}

function RuleForm({ saving, onFinish }: { saving: boolean; onFinish: (values: RiskRulePayload) => void }) {
  return (
    <Form
      layout="vertical"
      onFinish={onFinish}
      initialValues={{
        severity: "RED",
        priority: 100,
        rule_type: "RISK_LEVEL",
        review_status: "EXPERT_REVIEW_DRAFT",
        op: "gte",
        is_active: true,
        path: "fitness_test.sbp",
        value: "175"
      }}
    >
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="code" label="规则编码" rules={[{ required: true }]}>
            <Input placeholder="CUSTOM_RED_SBP" />
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
            <Input placeholder="RISK_LEVEL / CONTRAINDICATION / STOP_SIGNAL" />
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
            <Input placeholder="adult，hypertension，older_adult" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="is_active" label="状态">
            <Select options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} />
          </Form.Item>
        </Col>
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
      <Button type="primary" htmlType="submit" loading={saving}>
        保存规则
      </Button>
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
      <Form.Item name="snapshot" label="测试快照 JSON" rules={[{ required: true }]}>
        <Input.TextArea rows={12} />
      </Form.Item>
      <Button htmlType="submit" loading={saving}>
        运行规则测试
      </Button>
    </Form>
  );
}
