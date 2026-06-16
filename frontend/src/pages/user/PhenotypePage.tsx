import { Alert, Button, Col, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ShieldAlert } from "lucide-react";

import { classifyMe, type ClusterAssignment } from "../../api/clusters";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ClinicalStatusBadge,
  DataNote,
  EvidenceTimeline,
  ForbiddenActionsPanel,
  FlowProgress,
  formatStatusLabel,
  RiskHeroBadge,
  RiskStatusPanel,
  sanitizeDisplayText,
  StatusTile,
  WorkbenchSection
} from "../../components/ProductUI";

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
    action: "查看医学评估建议"
  }
};

const forbiddenActionsByRisk: Record<string, string[]> = {
  R0: ["不要跳过运动前自检。", "不要在胸痛、晕厥、严重气短时继续训练。"],
  R1: ["不要自行提升到高强度训练。", "不要忽略血压、疼痛和异常疲劳反馈。"],
  R2: ["审核发布前不要开始训练。", "不要查看或复制未发布的动作、强度和进阶计划。", "不要导出处方训练报告。"],
  R3: ["不要生成训练计划。", "不要展示动作、组数、强度或进阶安排。", "不要导出处方训练报告，请先进行医学评估。"]
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
  const decisionTone = riskLevel === "R3" ? "danger" : riskLevel === "R2" ? "warning" : riskLevel ? "safe" : "info";
  const nextActionHref = riskLevel === "R3" ? "/user/dashboard" : riskLevel ? "/user/prescriptions" : "/user/health-data";
  const reviewDisplayLabel =
    summary?.expert_review_status
      ? formatStatusLabel(summary.expert_review_status, "review")
      : sanitizeDisplayText(summary?.review_status_label ?? "审核状态待生成", "review") || "审核状态待生成";
  const classifyButtonLabel = riskLevel ? "重新评估" : "生成分型";
  const riskHeroActions = (
    <Space wrap>
      {riskLevel ? (
        <Link to={nextActionHref}>
          <Button type="primary">{guidance.action}</Button>
        </Link>
      ) : null}
      <Button type={riskLevel ? "default" : "primary"} loading={loading} onClick={runClassify}>
        {classifyButtonLabel}
      </Button>
      {!riskLevel ? (
        <Link to={nextActionHref}>
          <Button>{guidance.action}</Button>
        </Link>
      ) : null}
      {riskLevel === "R2" ? (
        <Tag color="orange">审核通过前不开放训练入口</Tag>
      ) : null}
      {riskLevel === "R3" ? (
        <Tag color="red">仅显示医学评估建议</Tag>
      ) : null}
    </Space>
  );

  return (
    <AppShell
      role="user"
      title="风险结果"
      subtitle="先看 R0-R3 安全边界，再看分型标签和下一步动作"
      statusItems={
        <>
          <ClinicalStatusBadge type="risk" value={riskLevel} />
          <ClinicalStatusBadge type="review" value={riskLevel === "R2" ? "pending_review" : riskLevel ? "approved" : "pending"} label={reviewDisplayLabel} />
        </>
      }
    >
      <Space direction="vertical" size={16} className="onboarding-section">
        <div className={`ue-scope tone-${decisionTone === "danger" ? "danger" : decisionTone === "warning" ? "warning" : "info"}`}>
          <section className="ue-hero" aria-label="风险评估结果">
            <div className="ue-disc">
              <span className="ue-disc-grade">{riskLevel ?? "--"}</span>
              <span className="ue-disc-icon" aria-hidden="true">
                {riskLevel === "R3" ? <ShieldAlert /> : riskLevel === "R2" ? <AlertTriangle /> : <Activity />}
              </span>
            </div>
            <div className="ue-hero-body">
              <span className="ue-hero-eyebrow">风险评估结果</span>
              <h2 className="ue-hero-title">
                {riskLevel ? `评估结果：${riskLevel} ${guidance.action}` : "评估结果待生成"}
              </h2>
              <p className="ue-hero-desc">{guidance.message}</p>
            </div>
            <div className="ue-hero-aside">{riskHeroActions}</div>
          </section>
        </div>
        <RiskHeroBadge level={riskLevel} actionLabel={null} />
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <div className="status-grid">
          <StatusTile label="风险规则" value={riskLevel ?? "待生成"} detail="R0/R1/R2/R3 不被聚类覆盖" tone={decisionTone === "danger" ? "danger" : decisionTone === "warning" ? "warning" : "info"} />
          <StatusTile label="专家审核" value={reviewDisplayLabel} detail="R2 审核通过才开放训练" tone={riskLevel === "R2" ? "warning" : "neutral"} />
          <StatusTile label="下一步" value={guidance.action} detail="系统只展示允许的动作" />
        </div>
        <div className={`risk-report-grid risk-report-${String(riskLevel ?? "unknown").toLowerCase()}`}>
          <WorkbenchSection title="触发规则与评判依据" description="先给出安全结论，再展示规则、证据和流程位置。">
            <Space direction="vertical" size={16} className="onboarding-section">
              <FlowProgress current={progressStep} />
              <Alert type="info" showIcon message="分型结果只用于模板匹配，不覆盖风险规则。" />
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={10}>
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Typography.Text type="secondary">当前风险边界</Typography.Text>
                    <ClinicalStatusBadge type="risk" value={riskLevel} />
                    <RiskStatusPanel level={riskLevel} />
                    <Alert type={guidance.type} showIcon message={guidance.message} />
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
                    <DataNote
                      title="分型尚未生成"
                      description="完成基础信息、体质测试、身体成分、生化指标和风险问卷后，可生成健康画像与人群标签。"
                    />
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
              <Link to="/user/dashboard">
                <Button>返回用户端</Button>
              </Link>
            </Space>
          </WorkbenchSection>
          <aside className="workbench-side-rail">
            <ForbiddenActionsPanel
              tone={riskLevel === "R3" ? "danger" : "warning"}
              items={forbiddenActionsByRisk[String(riskLevel)] ?? ["完成风险筛查前不要生成训练处方。", "资料缺失时不要用默认强度替代医学判断。"]}
            />
            <div className="checklist-rail">
              <Typography.Title level={5}>判定含义</Typography.Title>
              <ul>
                <li>R0/R1 可进入自动或改善处方。</li>
                <li>R2 只显示审核状态，发布前不展示训练动作。</li>
                <li>R3 不生成训练计划，只显示医学评估建议。</li>
              </ul>
            </div>
            <DataNote
              title="聚类不是风险等级"
              description="人群分型用于模板匹配和解释用户画像，真正决定训练入口的是风险规则命中结果。"
            />
          </aside>
        </div>
      </Space>
    </AppShell>
  );
}
