import { Alert, Button, Card, Col, Form, Input, Layout, Row, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { createRiskRule, listRiskRules, testRiskRules, type RiskRuleItem, type RiskRulePayload } from "../../api/adminRules";

const severityOptions = ["RED", "YELLOW", "GREEN"].map((value) => ({ value, label: value }));
const opOptions = ["eq", "gte", "between", "in_any", "not_empty_restriction"].map((value) => ({ value, label: value }));

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

export function AdminRulesPage() {
  const [rules, setRules] = useState<RiskRuleItem[]>([
    {
      id: 0,
      code: "CUSTOM_RED_SBP",
      name: "自定义收缩压红色风险",
      severity: "RED",
      message: "收缩压达到红色风险。",
      condition: { path: "fitness_test.sbp", op: "gte", value: 175 },
      contraindications: ["禁止生成训练方案"],
      intensity_cap: "不生成训练处方",
      is_active: true,
      version: 1,
      created_at: "",
      updated_at: ""
    }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

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
      await createRiskRule({
        code: values.code,
        name: values.name,
        severity: values.severity,
        message: values.message,
        condition: {
          path: values.path,
          op: values.op,
          value: parseJson(values.value as string, values.value)
        },
        contraindications: splitTags(values.contraindications as string),
        intensity_cap: values.intensity_cap,
        is_active: values.is_active ?? true
      });
      await refreshRules();
      setNotice("风险规则已保存并记录审计。");
    } catch {
      setNotice("保存风险规则失败，请检查 DSL 字段或权限。");
    } finally {
      setSaving(false);
    }
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
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          风险规则管理
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>审计日志</Button>
            </Link>
          </Space>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="规则 DSL">
                <RuleForm saving={saving} onFinish={saveRule} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="规则测试工具">
                <RuleTestForm saving={saving} onFinish={runRuleTest} />
                {testResult ? (
                  <Alert
                    className="form-alert"
                    type={(testResult.risk_level as string) === "R3" ? "error" : "info"}
                    showIcon
                    message={`测试结果：${testResult.risk_level}`}
                    description={JSON.stringify(testResult.matched_rules)}
                  />
                ) : null}
              </Card>
            </Col>
          </Row>
          <Card title="规则列表">
            <Table
              rowKey="id"
              loading={loading}
              dataSource={rules}
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
                  render: (value: Record<string, unknown>) => JSON.stringify(value)
                },
                {
                  title: "状态",
                  dataIndex: "is_active",
                  render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
                },
                { title: "版本", dataIndex: "version" }
              ]}
            />
          </Card>
        </Space>
      </Layout.Content>
    </Layout>
  );
}

function RuleForm({ saving, onFinish }: { saving: boolean; onFinish: (values: RiskRulePayload) => void }) {
  return (
    <Form
      layout="vertical"
      onFinish={onFinish}
      initialValues={{
        severity: "RED",
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
