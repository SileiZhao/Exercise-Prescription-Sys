import { Alert, Button, Card, Col, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CalendarCheck, FileText, Flame, HeartPulse, ShieldCheck } from "lucide-react";

import { getHealthSnapshot, type HealthSnapshot } from "../../api/healthData";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ChartCard,
  ClinicalScopePanel,
  EmptyState,
  MetricCard,
  MotionCard,
  RiskBadge,
  RiskStatusPanel,
  SafetyBoundaryChecklist
} from "../../components/ProductUI";
import { AdherenceChart, FeedbackTrendChart, HealthRadarChart } from "../../components/charts";

function displayValue(value: string | number | null | undefined, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fallbackFeedbackTrend(summary: UserDashboardSummary | null) {
  if (summary?.feedback_trend?.length) {
    return summary.feedback_trend.map((item) => ({
      date: item.date,
      rpe: item.rpe,
      pain: item.pain ?? undefined,
      completionRate: item.completion_rate
    }));
  }
  const recent = summary?.recent_feedback;
  if (!recent) {
    return [];
  }
  const rpe = numericValue(recent.rpe);
  const pain = numericValue(recent.pain_score_after);
  const completionRate = numericValue(recent.completion_rate);
  if (rpe === null && pain === null && completionRate === null) {
    return [];
  }
  return [
    {
      date: recent.exercise_date ?? "最新反馈",
      rpe: rpe ?? undefined,
      pain: pain ?? undefined,
      completionRate: completionRate ?? undefined
    }
  ];
}

function snapshotRadar(snapshot: HealthSnapshot | null) {
  const data: Array<{ metric: string; value: number; max: number }> = [];
  const add = (metric: string, value: unknown, max: number) => {
    const parsed = numericValue(value);
    if (parsed !== null) {
      data.push({ metric, value: parsed, max });
    }
  };

  add("BMI", snapshot?.profile?.bmi, 40);
  add("收缩压", snapshot?.fitness_test?.sbp, 180);
  add("舒张压", snapshot?.fitness_test?.dbp, 110);
  add("静息心率", snapshot?.fitness_test?.resting_hr, 120);
  add("疼痛", snapshot?.fitness_test?.pain_score, 10);
  add("体脂率", snapshot?.body_composition?.body_fat_pct, 45);
  add("内脏脂肪", snapshot?.body_composition?.visceral_fat_level, 20);
  add("空腹血糖", snapshot?.biochemical_index?.fbg, 16.7);
  add("糖化血红蛋白", snapshot?.biochemical_index?.hba1c, 12);
  return data;
}

function fallbackHealthRadar(summary: UserDashboardSummary | null, snapshot: HealthSnapshot | null) {
  if (summary?.health_radar?.length) {
    return summary.health_radar;
  }
  const fromSnapshot = snapshotRadar(snapshot);
  if (fromSnapshot.length) {
    return fromSnapshot;
  }
  if (!summary) {
    return [];
  }
  return [
    { metric: "本周完成率", value: numericValue(summary.weekly_completion_rate) ?? 0, max: 100 },
    { metric: "连续运动", value: numericValue(summary.streak_days) ?? 0, max: 14 },
    { metric: "周达标", value: numericValue(summary.weekly_target_hits) ?? 0, max: 7 },
    { metric: "异常反馈", value: numericValue(summary.abnormal_feedback_count) ?? 0, max: 10 }
  ];
}

function isReviewPublished(summary: UserDashboardSummary | null) {
  return ["已发布", "PUBLISHED", "APPROVED", "已通过"].includes(
    String(summary?.review_status_label ?? summary?.expert_review_status ?? "")
  );
}

function actionForSummary(summary: UserDashboardSummary | null) {
  const risk = summary?.current_risk_level;
  if (risk === "R3") {
    return { label: "查看安全建议", to: "/user/risk-result" };
  }
  if (risk === "R2" && !isReviewPublished(summary)) {
    return { label: "查看审核状态", to: "/user/prescriptions" };
  }
  if (summary?.today_can_exercise) {
    return { label: "进入今日任务", to: "/user/today" };
  }
  return { label: "查看处方状态", to: "/user/prescriptions" };
}

function FittSummaryGrid({ fitt }: { fitt?: Record<string, unknown> | null }) {
  const items: Array<[letter: string, label: string, value: unknown, unit: string]> = [
    ["F", "频率", fitt?.frequency, ""],
    ["I", "强度", fitt?.intensity, "RPE"],
    ["T", "时间", fitt?.time, ""],
    ["T", "类型", Array.isArray(fitt?.type) ? (fitt?.type as unknown[]).join("、") : fitt?.type, ""],
    ["V", "总量", fitt?.volume, ""],
    ["P", "进阶", fitt?.progression, ""]
  ];
  return (
    <div className="fitt-summary-grid">
      {items.map(([letter, label, value, unit]) => (
        <div className="fitt-summary-item" key={`${letter}-${label}`}>
          <span className="fitt-letter">{letter}</span>
          <div>
            <Typography.Text type="secondary">{label}</Typography.Text>
            <Typography.Text strong>{displayValue(value as string | number | null | undefined)}</Typography.Text>
            {unit ? <Typography.Text type="secondary">{unit}</Typography.Text> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function StopExerciseChecklist() {
  return (
    <Alert
      className="stop-exercise-alert"
      type="error"
      showIcon
      message="何时停止运动"
      description="胸痛、胸闷、晕厥/黑蒙、明显气短、心悸不适、疼痛快速加重、疑似低血糖或任何异常危险感，立即停止并按平台提示处理。"
    />
  );
}

export function UserDashboardPage() {
  const [summary, setSummary] = useState<UserDashboardSummary | null>(null);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getUserDashboard()
      .then((nextSummary) => {
        if (!active) return;
        setSummary(nextSummary);
        if (!nextSummary.health_radar?.length) {
          getHealthSnapshot()
            .then((snapshot) => {
              if (active) setHealthSnapshot(snapshot);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const recent = summary?.recent_feedback;
  const riskLevel = summary?.current_risk_level ?? "未评估";
  const published = isReviewPublished(summary);
  const isR2Locked = summary?.current_risk_level === "R2" && !published;
  const isR3 = summary?.current_risk_level === "R3";
  const canStartTraining = Boolean(summary?.today_can_exercise) && !isR2Locked && !isR3;
  const safetyDecision = canStartTraining ? "今日可运动" : "今日不可运动";
  const action = actionForSummary(summary);
  const canShowFitt = !isR3 && !isR2Locked;
  const adherenceData = (summary?.plan_completion_trend ?? []).map((completionRate, index) => ({
    label: `第${index + 1}次`,
    completionRate,
    targetRate: 80
  }));
  const feedbackTrendData = fallbackFeedbackTrend(summary);
  const healthRadarData = fallbackHealthRadar(summary, healthSnapshot);
  const profileCompletion = summary?.profile_completion_rate ?? 0;
  const contraindications = summary?.prescription_summary?.contraindications ?? [];

  return (
    <AppShell
      role="user"
      title="今日安全状态"
      subtitle={`${riskLevel} · ${summary?.review_status_label ?? "待评估"}`}
    >
      <Space direction="vertical" size={16} className="onboarding-section user-dashboard-page">
        <section
          aria-label="今日安全状态带"
          className={`today-safety-band risk-band-${summary?.current_risk_level ?? "unknown"}`}
        >
          <div className="today-safety-main">
            <Typography.Text type="secondary">当前风险等级</Typography.Text>
            <RiskBadge level={summary?.current_risk_level} />
            <Typography.Title level={3}>{safetyDecision}</Typography.Title>
            <Typography.Text className="safety-summary-line">
              {`${riskLevel} 风险 · ${summary?.review_status_label ?? "待评估"} · ${safetyDecision}`}
            </Typography.Text>
            <Typography.Text className="safety-pass-value">{canStartTraining ? "可运动" : "不可运动"}</Typography.Text>
          </div>
          <Link to={action.to}>
            <Button type="primary" size="large" icon={<FileText size={16} />}>{action.label}</Button>
          </Link>
        </section>

        <ClinicalScopePanel compact />
        {error ? <Alert type="error" showIcon message="加载用户看板失败，请稍后重试。" /> : null}
        {!canStartTraining && summary?.today_block_reason ? (
          <Alert type="warning" showIcon message={summary.today_block_reason} />
        ) : null}

        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard title="档案完成度" value={profileCompletion} suffix="%" icon={<ShieldCheck />} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard title="审核状态" value={displayValue(summary?.review_status_label)} icon={<ShieldCheck />} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard title="本周完成率" value={summary?.weekly_completion_rate ?? 0} suffix="%" icon={<CalendarCheck />} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard title="下次复评" value={displayValue(summary?.next_reassessment_date)} icon={<CalendarCheck />} />
          </Col>
        </Row>

        <RiskStatusPanel level={summary?.current_risk_level} title="安全边界" />
        <SafetyBoundaryChecklist compact />

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={16}>
            <MotionCard>
              <Space direction="vertical" size={12} className="onboarding-section">
                <div>
                  <Typography.Title level={4}>{canShowFitt ? "FITT-VP 处方结构" : "安全状态说明"}</Typography.Title>
                  <Typography.Text strong>
                    {(summary?.current_stage_goals ?? []).join(" / ") || "尚未设置阶段目标"}
                  </Typography.Text>
                </div>
                {canShowFitt ? (
                  <>
                    <FittSummaryGrid fitt={summary?.prescription_summary?.fitt_vp} />
                  </>
                ) : isR2Locked ? (
                  <Alert type="warning" showIcon message="专家审核中" description="R2 审核通过前不展示训练动作、强度和开始训练入口。" />
                ) : (
                  <Alert type="error" showIcon message="高风险安全建议" description="R3 不展示训练动作、强度、组数或进阶计划。" />
                )}
                <Space wrap>
                  <Typography.Text type="secondary">禁忌动作</Typography.Text>
                  {(contraindications.length ? contraindications : ["高强度冲刺", "憋气发力", "疼痛硬撑"]).map((item) => (
                    <Tag color="red" key={item}>{item}</Tag>
                  ))}
                </Space>
                <StopExerciseChecklist />
                {summary?.prescription_summary?.safety_notice ? (
                  <Alert type="info" showIcon message={summary.prescription_summary.safety_notice} />
                ) : null}
                <Row gutter={[8, 8]}>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">处方版本</Typography.Text>
                    <Typography.Title level={5}>{summary?.prescription_version ? `v${summary.prescription_version}` : "-"}</Typography.Title>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">复评说明</Typography.Text>
                    <Typography.Title level={5}>{displayValue(summary?.prescription_summary?.reassessment)}</Typography.Title>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">专家审核状态</Typography.Text>
                    <Typography.Title level={5}>{displayValue(summary?.expert_review_status)}</Typography.Title>
                  </Col>
                </Row>
                <Tag>{summary?.prescription_summary?.cluster_label ?? "未分型"}</Tag>
              </Space>
            </MotionCard>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="最新反馈预警" className="dashboard-panel feedback-warning-card">
              <Space direction="vertical" size={12} className="onboarding-section">
                <div className="feedback-number-grid">
                  <div><Typography.Text type="secondary">RPE</Typography.Text><Typography.Title level={3}>{displayValue(recent?.rpe)}</Typography.Title></div>
                  <div><Typography.Text type="secondary">疼痛</Typography.Text><Typography.Title level={3}>{displayValue(recent?.pain_score_after)}</Typography.Title></div>
                  <div><Typography.Text type="secondary">完成率</Typography.Text><Typography.Title level={3}>{displayValue(recent?.completion_rate)}%</Typography.Title></div>
                </div>
                <Typography.Title level={4}>{displayValue(recent?.rpe)} / {displayValue(recent?.pain_score_after)}</Typography.Title>
                <Typography.Text>{displayValue(recent?.exercise_type)} · 完成率 {displayValue(recent?.completion_rate)}%</Typography.Text>
                <Typography.Text>异常反馈 {summary?.abnormal_feedback_count ?? 0} 次</Typography.Text>
                <Typography.Text type="secondary">
                  不适反馈 {(recent?.discomfort ?? []).length ? recent?.discomfort.join("、") : "无"}
                </Typography.Text>
                <FeedbackTrendChart data={feedbackTrendData} loading={!summary && !error} height={210} />
              </Space>
            </Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <MetricCard title="连续运动天数" value={summary?.streak_days ?? 0} suffix=" 天" icon={<Flame />} />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard title="周达标次数" value={summary?.weekly_target_hits ?? 0} suffix=" 次" icon={<HeartPulse />} />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard title="异常反馈次数" value={summary?.abnormal_feedback_count ?? 0} suffix=" 次" icon={<AlertTriangle />} />
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={12}>
            <Card title="血压/血糖监测提醒" className="dashboard-panel">
              {(summary?.monitoring_reminders ?? []).length ? (
                <List dataSource={summary?.monitoring_reminders ?? []} renderItem={(item) => <List.Item>{item}</List.Item>} />
              ) : (
                <EmptyState description="暂无监测提醒" />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title="计划完成趋势">
              <AdherenceChart data={adherenceData} loading={!summary && !error} />
            </ChartCard>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title="健康画像雷达">
              <HealthRadarChart data={healthRadarData} loading={!summary && !error} />
            </ChartCard>
          </Col>
        </Row>

        <Space wrap>
          <Link to="/user/onboarding"><Button type="primary">继续建档</Button></Link>
          <Link to="/user/prescriptions"><Button>处方状态</Button></Link>
          <Link to="/user/phase-report"><Button>阶段报告</Button></Link>
        </Space>
      </Space>
    </AppShell>
  );
}
