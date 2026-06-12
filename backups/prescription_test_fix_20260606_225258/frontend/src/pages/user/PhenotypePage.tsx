import { Alert, Button, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { AlertTriangle, ClipboardCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { classifyMe, type ClusterAssignment } from "../../api/clusters";
import { getUserDashboard, type RiskRuleHitSummary, type UserDashboardSummary } from "../../api/userDashboard";
import { AppShell, EvidenceTimeline, FlowProgress, MotionCard, RiskBadge, RiskStatusPanel } from "../../components/ProductUI";

type RiskGuidance = {
  type: "success" | "info" | "warning" | "error";
  levelName: string;
  explanation: string;
  message: string;
  systemAction: string;
  primaryAction: string;
  actionTo: string;
  icon: JSX.Element;
};

const riskGuidance: Record<string, RiskGuidance> = {
  R0: {
    type: "success",
    levelName: "低风险",
    explanation: "可自动生成基础运动处方。",
    message: "低风险，可自动生成基础处方。请按 FITT-VP 计划循序渐进，并继续记录反馈。",
    systemAction: "允许生成处方",
    primaryAction: "生成运动处方",
    actionTo: "/user/prescriptions",
    icon: <ShieldCheck size={22} />
  },
  R1: {
    type: "info",
    levelName: "轻中风险",
    explanation: "可生成改善处方，并持续追踪反馈。",
    message: "轻中风险，可生成改善处方。平台会提示安全边界，必要时进入专家抽查。",
    systemAction: "允许生成处方",
    primaryAction: "生成运动处方",
    actionTo: "/user/prescriptions",
    icon: <ShieldCheck size={22} />
  },
  R2: {
    type: "warning",
    levelName: "中风险",
    explanation: "需专家审核，审核通过前不可开始训练。",
    message: "中风险，必须进入专家审核。审核通过前不得展示训练动作、强度或开始入口。",
    systemAction: "强制专家审核",
    primaryAction: "提交专家审核",
    actionTo: "/user/prescriptions",
    icon: <AlertTriangle size={22} />
  },
  R3: {
    type: "error",
    levelName: "高风险",
    explanation: "仅显示医学评估与转介建议。",
    message: "高风险，不展示训练计划、动作组数、强度和进阶计划，仅显示医学评估建议。",
    systemAction: "阻断训练处方",
    primaryAction: "查看安全建议",
    actionTo: "/user/health-data",
    icon: <ShieldAlert size={22} />
  }
};

const riskToneClass: Record<string, string> = {
  R0: "risk-decision-r0",
  R1: "risk-decision-r1",
  R2: "risk-decision-r2",
  R3: "risk-decision-r3"
};

function guidanceFor(level: string | null): RiskGuidance {
  return (
    riskGuidance[String(level)] ?? {
      type: "info",
      levelName: "未完成评估",
      explanation: "完成六类数据采集后生成风险边界。",
      message: "完成六类数据采集后，平台将按风险规则生成 R0/R1/R2/R3 安全边界。",
      systemAction: "等待建档",
      primaryAction: "完善建档",
      actionTo: "/user/health-data",
      icon: <ClipboardCheck size={22} />
    }
  );
}

function displayRuleValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function ruleName(rule: RiskRuleHitSummary) {
  return rule.rule_name || rule.name || String(rule.rule_id ?? "风险规则");
}

function renderRuleHits(ruleHits: RiskRuleHitSummary[], fallbackLevel: string | null) {
  if (!ruleHits.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="当前后端未返回命中规则明细"
        description="页面保留安全边界和下一步动作；待后端补充 rule_hits 后将展示字段路径、命中值、阈值和处理动作。"
      />
    );
  }

  return (
    <ol className="risk-rule-timeline" aria-label="命中规则时间线">
      {ruleHits.map((rule, index) => {
        const level = String(rule.risk_level || fallbackLevel || "R1");
        return (
          <li key={`${rule.rule_id ?? ruleName(rule)}-${index}`} className={`risk-rule-item ${riskToneClass[level] ?? ""}`}>
            <span className="risk-rule-dot" aria-hidden="true" />
            <div className="risk-rule-main">
              <Typography.Text strong>{ruleName(rule)}</Typography.Text>
              {rule.explanation ? <Typography.Paragraph>{rule.explanation}</Typography.Paragraph> : null}
              <Space size={8} wrap>
                <Tag>{`字段：${displayRuleValue(rule.field_path || rule.path)}`}</Tag>
                <Tag>{`命中值：${displayRuleValue(rule.hit_value ?? rule.value)}`}</Tag>
                <Tag>{`阈值：${displayRuleValue(rule.threshold)}`}</Tag>
              </Space>
            </div>
            <Tag color={level === "R3" ? "red" : level === "R2" ? "orange" : "blue"}>
              {rule.action_label || rule.action || "纳入风险判定"}
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

export function PhenotypePage() {
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState<ClusterAssignment | null>(null);
  const [summary, setSummary] = useState<UserDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserDashboard()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  async function runClassify() {
    setLoading(true);
    setError(null);
    try {
      setAssignment(await classifyMe());
    } catch {
      setError("生成分型失败，请先完成六类数据采集。");
    } finally {
      setLoading(false);
    }
  }

  const riskLevel = summary?.current_risk_level ?? null;
  const guidance = guidanceFor(riskLevel);
  const progressStep = riskLevel ? 4 : assignment ? 3 : 1;
  const ruleHits = summary?.risk_rule_hits ?? [];

  return (
    <AppShell role="user" title="风险分型结果">
      <Space direction="vertical" size={16} className="onboarding-section risk-result-page">
        <MotionCard className="phenotype-card">
          <Space direction="vertical" size={16} className="onboarding-section">
            <FlowProgress current={progressStep} />
            <Alert type="info" showIcon message="分型结果只用于模板匹配，不覆盖风险规则。" />
            {error ? <Alert type="error" showIcon message={error} /> : null}

            <section
              className={`risk-decision-report ${riskToneClass[String(riskLevel)] ?? "risk-decision-unknown"}`}
              data-testid="risk-decision-report-card"
              aria-label="风险判定报告"
            >
              <div className="risk-decision-badge">
                <span className="risk-decision-icon">{guidance.icon}</span>
                <Typography.Title level={2}>{riskLevel ?? "待评估"}</Typography.Title>
                <RiskBadge level={riskLevel} />
              </div>
              <div className="risk-decision-copy">
                <Typography.Text className="page-hero-eyebrow">判定报告</Typography.Text>
                <Typography.Title level={3}>{guidance.levelName}</Typography.Title>
                <Typography.Paragraph>{guidance.explanation}</Typography.Paragraph>
                <Alert type={guidance.type} showIcon message={guidance.message} />
                <Typography.Text type="secondary">
                  {summary?.review_status_label ? `审核状态：${summary.review_status_label}` : "完成建档后显示审核状态"}
                </Typography.Text>
              </div>
              <div className="risk-decision-action">
                <Typography.Text type="secondary">系统动作</Typography.Text>
                <Tag color={riskLevel === "R3" ? "red" : riskLevel === "R2" ? "orange" : "blue"}>
                  {guidance.systemAction}
                </Tag>
                <Typography.Text type="secondary">操作区已固定在报告底部</Typography.Text>
              </div>
            </section>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Space direction="vertical" size={12} className="onboarding-section">
                  <Typography.Text type="secondary">当前风险边界</Typography.Text>
                  <RiskStatusPanel level={riskLevel} />
                </Space>
              </Col>
              <Col xs={24} lg={14}>
                <Space direction="vertical" size={12} className="onboarding-section">
                  <Typography.Title level={4}>人群分型</Typography.Title>
                  {assignment ? (
                    <>
                      <Space wrap>
                        {assignment.rule_labels.map((label) => (
                          <Tag color="blue" key={label}>
                            {label}
                          </Tag>
                        ))}
                        {assignment.cluster_label ? <Tag color="cyan">{assignment.cluster_label}</Tag> : null}
                      </Space>
                      <Typography.Paragraph>{assignment.profile_summary}</Typography.Paragraph>
                    </>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="完成基础信息、体质测试、身体成分、生化指标和风险问卷后，可生成健康画像与人群标签。"
                    />
                  )}
                </Space>
              </Col>
            </Row>

            <section className="risk-rule-section">
              <div className="section-heading-row">
                <div>
                  <Typography.Text className="page-hero-eyebrow">Rules</Typography.Text>
                  <Typography.Title level={4}>命中规则</Typography.Title>
                </div>
                <Tag>{`${ruleHits.length} 条`}</Tag>
              </div>
              {renderRuleHits(ruleHits, riskLevel)}
            </section>

            <EvidenceTimeline
              items={[
                { title: "六类数据", description: "基础信息、体测、体成分、生化、风险问卷和反馈记录", status: "done" },
                { title: "风险规则", description: guidance.message, status: riskLevel ? "done" : "active" },
                { title: "系统动作", description: guidance.systemAction, status: riskLevel === "R3" ? "active" : "pending" }
              ]}
            />

            <div className="risk-result-action-bar" data-testid="risk-result-action-bar">
              <Space wrap>
                <Button loading={loading} onClick={runClassify}>
                  生成分型
                </Button>
                <Link to={guidance.actionTo}>
                  <Button type="primary" danger={riskLevel === "R3"}>
                    {guidance.primaryAction}
                  </Button>
                </Link>
                <Link to="/user/dashboard">
                  <Button>返回用户端</Button>
                </Link>
              </Space>
            </div>
          </Space>
        </MotionCard>
      </Space>
    </AppShell>
  );
}
