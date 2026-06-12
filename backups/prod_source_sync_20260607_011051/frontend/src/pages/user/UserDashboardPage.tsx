import { Alert, Button, Card, Col, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CalendarCheck, Flame, HeartPulse, ShieldCheck } from "lucide-react";

import { getHealthSnapshot, type HealthSnapshot } from "../../api/healthData";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ChartCard,
  EmptyState,
  FITTVPCard,
  MetricCard,
  MotionCard,
  PageHero,
  RiskBadge,
  RiskStatusPanel
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
  const canExerciseText = summary?.today_can_exercise ? "可运动" : "不可运动";
  const canShowFitt =
    summary?.current_risk_level !== "R3" &&
    (summary?.current_risk_level !== "R2" ||
      summary?.today_can_exercise ||
      ["已发布", "PUBLISHED", "APPROVED"].includes(String(summary?.review_status_label ?? summary?.expert_review_status)));
  const adherenceData = (summary?.plan_completion_trend ?? []).map((completionRate, index) => ({
    label: `第${index + 1}次`,
    completionRate,
    targetRate: 80
  }));
  const feedbackTrendData = fallbackFeedbackTrend(summary);
  const healthRadarData = fallbackHealthRadar(summary, healthSnapshot);

  return (
    <AppShell
      role="user"
      title="用户看板"
      subtitle={`${summary?.current_risk_level ?? "未评估"} · ${summary?.review_status_label ?? "待评估"}`}
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <PageHero
            eyebrow="用户端业务状态"
            title="今日运动安全总览"
            summary={`${summary?.current_risk_level ?? "未评估"} 风险 · ${summary?.review_status_label ?? "待评估"} · 今日${canExerciseText}`}
            actions={
              <Link to={summary?.today_can_exercise ? "/user/today" : "/user/prescriptions"}>
                <Button type="primary">{summary?.today_can_exercise ? "进入今日任务" : "查看处方状态"}</Button>
              </Link>
            }
          />
          {error ? <Alert type="error" showIcon message="加载用户看板失败，请稍后重试。" /> : null}
          {!summary?.today_can_exercise && summary?.today_block_reason ? (
            <Alert type="warning" showIcon message={summary.today_block_reason} />
          ) : null}
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} lg={6}>
              <MotionCard className="metric-card">
                <Space direction="vertical" size={8}>
                  <Typography.Text type="secondary">当前风险等级</Typography.Text>
                  <RiskBadge level={summary?.current_risk_level} />
                </Space>
              </MotionCard>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <MetricCard title="审核状态" value={displayValue(summary?.review_status_label)} icon={<ShieldCheck />} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <MetricCard title="今日可运动" value={canExerciseText} icon={<Activity />} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <MetricCard title="本周完成率" value={summary?.weekly_completion_rate ?? 0} suffix="%" icon={<CalendarCheck />} />
            </Col>
          </Row>
          <RiskStatusPanel level={summary?.current_risk_level} title="安全边界" />
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={14}>
              <MotionCard>
                <Space direction="vertical" size={12} className="onboarding-section">
                  <Typography.Title level={4}>当前阶段目标</Typography.Title>
                  <Typography.Text strong>
                    {(summary?.current_stage_goals ?? []).join(" / ") || "尚未设置阶段目标"}
                  </Typography.Text>
                  {canShowFitt ? (
                    <FITTVPCard fitt={summary?.prescription_summary?.fitt_vp} riskLevel={summary?.current_risk_level} />
                  ) : summary?.current_risk_level === "R2" ? (
                    <Alert type="warning" showIcon message="专家审核中" description="R2 审核通过前不展示训练动作、强度和开始训练入口。" />
                  ) : (
                    <FITTVPCard fitt={summary?.prescription_summary?.fitt_vp} riskLevel={summary?.current_risk_level} />
                  )}
                  {summary?.prescription_summary?.safety_notice ? (
                    <Alert type="info" showIcon message={summary.prescription_summary.safety_notice} />
                  ) : null}
                  <Row gutter={[8, 8]}>
                    <Col xs={24} sm={8}>
                      <Typography.Text type="secondary">处方版本</Typography.Text>
                      <Typography.Title level={5}>{summary?.prescription_version ? `v${summary.prescription_version}` : "-"}</Typography.Title>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Typography.Text type="secondary">下次复评</Typography.Text>
                      <Typography.Title level={5}>{displayValue(summary?.next_reassessment_date)}</Typography.Title>
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
            <Col xs={24} lg={10}>
              <Card title="最新反馈预警" className="dashboard-panel">
                <Space direction="vertical" size={8}>
                  <Typography.Title level={4}>
                    {displayValue(recent?.rpe)} / {displayValue(recent?.pain_score_after)}
                  </Typography.Title>
                  <Typography.Text>{displayValue(recent?.exercise_type)} · 完成率 {displayValue(recent?.completion_rate)}%</Typography.Text>
                  <Typography.Text>异常反馈 {summary?.abnormal_feedback_count ?? 0} 次</Typography.Text>
                  <Typography.Text type="secondary">
                    不适反馈 {(recent?.discomfort ?? []).length ? recent?.discomfort.join("、") : "无"}
                  </Typography.Text>
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
                  <List
                    dataSource={summary?.monitoring_reminders ?? []}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
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
              <ChartCard title="反馈趋势">
                <FeedbackTrendChart data={feedbackTrendData} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="健康画像雷达">
                <HealthRadarChart data={healthRadarData} loading={!summary && !error} />
              </ChartCard>
            </Col>
          </Row>
          <Space wrap>
            <Link to="/user/onboarding">
              <Button type="primary">继续建档</Button>
            </Link>
            <Link to={summary?.today_can_exercise ? "/user/today" : "/user/prescriptions"}>
              <Button>{summary?.today_can_exercise ? "今日运动" : "查看处方状态"}</Button>
            </Link>
            <Link to="/user/prescriptions">
              <Button>我的处方</Button>
            </Link>
            <Link to="/user/phase-report">
              <Button>阶段报告</Button>
            </Link>
          </Space>
        </Space>
    </AppShell>
  );
}
