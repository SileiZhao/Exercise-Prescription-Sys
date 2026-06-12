import { Alert, Button, Col, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { classifyMe, type ClusterAssignment } from "../../api/clusters";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import { AppShell, EvidenceTimeline, FlowProgress, MotionCard, RiskBadge, RiskStatusPanel } from "../../components/ProductUI";

const riskGuidance: Record<string, { type: "success" | "info" | "warning" | "error"; message: string; action: string }> = {
  R0: {
    type: "success",
    message: "低风险，可自动生成基础处方。请按 FITT-VP 计划循序渐进，并继续记录反馈。",
    action: "查看处方"
  },
  R1: {
    type: "info",
    message: "轻中风险，可生成改善处方。平台会提示安全边界，必要时进入专家抽查。",
    action: "查看改善处方"
  },
  R2: {
    type: "warning",
    message: "中风险，必须显示专家审核中。审核通过前不得开始训练。",
    action: "查看审核状态"
  },
  R3: {
    type: "error",
    message: "高风险，不展示训练计划、动作组数、强度和进阶计划，仅显示医学评估建议。",
    action: "完善医学评估"
  }
};

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
  const guidance = riskGuidance[String(riskLevel)] ?? {
    type: "info" as const,
    message: "完成六类数据采集后，平台将按风险规则生成 R0/R1/R2/R3 安全边界。",
    action: "完善建档"
  };
  const progressStep = riskLevel ? 4 : assignment ? 3 : 1;

  return (
    <AppShell role="user" title="风险分型结果">
      <Space direction="vertical" size={16} className="onboarding-section">
        <MotionCard className="phenotype-card">
          <Space direction="vertical" size={16} className="onboarding-section">
            <FlowProgress current={progressStep} />
            <Alert type="info" showIcon message="分型结果只用于模板匹配，不覆盖风险规则。" />
            {error ? <Alert type="error" showIcon message={error} /> : null}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Space direction="vertical" size={12} className="onboarding-section">
                  <Typography.Text type="secondary">当前风险边界</Typography.Text>
                  <RiskBadge level={riskLevel} />
                  <RiskStatusPanel level={riskLevel} />
                  <Alert type={guidance.type} showIcon message={guidance.message} />
                  <Typography.Text type="secondary">
                    {summary?.review_status_label ? `审核状态：${summary.review_status_label}` : "完成建档后显示审核状态"}
                  </Typography.Text>
                </Space>
              </Col>
              <Col xs={24} lg={14}>
                {assignment ? (
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Typography.Text strong>规则分型标签</Typography.Text>
                    <Space wrap>
                      {assignment.rule_labels.map((label) => (
                        <Tag color="blue" key={label}>
                          {label}
                        </Tag>
                      ))}
                      {assignment.cluster_label ? <Tag color="cyan">{assignment.cluster_label}</Tag> : null}
                    </Space>
                    <Typography.Paragraph>{assignment.profile_summary}</Typography.Paragraph>
                  </Space>
                ) : (
                  <Typography.Paragraph>
                    完成基础信息、体质测试、身体成分、生化指标和风险问卷后，可生成健康画像与人群标签。
                  </Typography.Paragraph>
                )}
              </Col>
            </Row>
            <EvidenceTimeline
              items={[
                { title: "六类数据", description: "基础信息、体测、体成分、生化、风险问卷和反馈记录", status: "done" },
                { title: "风险规则", description: guidance.message, status: riskLevel ? "done" : "active" },
                { title: "下一步动作", description: guidance.action, status: riskLevel === "R3" ? "active" : "pending" }
              ]}
            />
            <Space wrap>
              <Button type="primary" loading={loading} onClick={runClassify}>
                生成分型
              </Button>
              <Link to={riskLevel === "R3" ? "/user/health-data" : "/user/prescriptions"}>
                <Button>{guidance.action}</Button>
              </Link>
              <Link to="/user/dashboard">
                <Button>返回用户端</Button>
              </Link>
            </Space>
          </Space>
        </MotionCard>
      </Space>
    </AppShell>
  );
}
