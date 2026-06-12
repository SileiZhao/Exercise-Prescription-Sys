import { Alert, Button, Col, Collapse, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, Flame, HeartPulse, ShieldCheck } from "lucide-react";

import { getHealthSnapshot, type HealthSnapshot } from "../../api/healthData";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ChartCard,
  ClinicalSummaryStrip,
  ClinicalStatusBadge,
  DataNote,
  DecisionBanner,
  EmptyState,
  FITTVPCard,
  formatStatusLabel,
  RiskBadge,
  RiskStatusPanel,
  sanitizeDisplayText,
  StatusTile,
  TaskLayout,
  WorkbenchSection
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
  const reviewDisplayLabel =
    summary?.expert_review_status
      ? formatStatusLabel(summary.expert_review_status, "review")
      : sanitizeDisplayText(summary?.review_status_label ?? "待评估", "review") || "待评估";
  const decisionTone =
    summary?.today_can_exercise ? "safe" : summary?.current_risk_level === "R3" ? "danger" : "warning";
  const decisionReason =
    summary?.today_block_reason ||
    (summary?.today_can_exercise
      ? "当前风险和审核状态允许进入今日任务，仍需在运动前确认红旗信号。"
      : "请先完成建档、风险判定或处方审核，再进入运动任务。");
  const canShowFitt =
    summary?.current_risk_level !== "R3" &&
    (summary?.current_risk_level !== "R2" ||
      summary?.today_can_exercise ||
      ["已发布", "PUBLISHED", "APPROVED"].includes(String(summary?.review_status_label ?? summary?.expert_review_status)));
  const primaryRoute =
    summary?.current_risk_level === "R3"
      ? "/user/risk-result"
      : summary?.today_can_exercise
        ? "/user/today"
        : summary?.current_risk_level === "R2"
          ? "/user/prescriptions"
          : "/user/health-data";
  const primaryLabel =
    summary?.current_risk_level === "R3"
      ? "查看医学评估建议"
      : summary?.today_can_exercise
        ? "进入运动前安全闸门"
        : summary?.current_risk_level === "R2"
          ? "查看审核状态"
          : "补充建档资料";
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
      title="今日通行证"
      subtitle={`${summary?.current_risk_level ?? "未评估"} · ${reviewDisplayLabel}`}
      statusItems={
        <>
          <ClinicalStatusBadge type="risk" value={summary?.current_risk_level} />
          <ClinicalStatusBadge type="review" value={summary?.expert_review_status ?? "pending"} label={reviewDisplayLabel} />
          <ClinicalStatusBadge type="exercise" value={Boolean(summary?.today_can_exercise)} label={canExerciseText} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={decisionTone}
            title={`今日${canExerciseText}`}
            description={
              <>
                {decisionReason}
                {" "}
                当前状态为 {summary?.current_risk_level ?? "未评估"}，审核状态为 {reviewDisplayLabel}。
              </>
            }
            meta={
              <>
                <ClinicalStatusBadge type="risk" value={summary?.current_risk_level} />
                <ClinicalStatusBadge type="review" value={summary?.expert_review_status ?? "pending"} label={reviewDisplayLabel} />
              </>
            }
            actions={
              <Link to={primaryRoute}>
                <Button type="primary">{primaryLabel}</Button>
              </Link>
            }
          />
          {error ? <Alert type="error" showIcon message="加载用户看板失败，请稍后重试。" /> : null}
          {!summary?.today_can_exercise && summary?.today_block_reason ? (
            <Alert type="warning" showIcon message={summary.today_block_reason} />
          ) : null}
          <ClinicalSummaryStrip className="user-decision-strip">
            <StatusTile
              label="安全状态"
              value={<RiskBadge level={summary?.current_risk_level} />}
              detail={summary?.current_risk_level === "R3" ? "仅显示医学评估建议" : "按停止信号自我监测"}
              tone={summary?.current_risk_level === "R3" ? "danger" : summary?.current_risk_level === "R2" ? "warning" : "safe"}
              icon={<ShieldCheck />}
            />
            <StatusTile
              label="执行状态"
              value={canExerciseText}
              detail={`本周完成率 ${summary?.weekly_completion_rate ?? 0}%`}
              tone={summary?.today_can_exercise ? "safe" : "warning"}
              icon={<Activity />}
            />
            <StatusTile
              label="近期异常"
              value={`${summary?.abnormal_feedback_count ?? 0} 次`}
              detail={(recent?.discomfort ?? []).length ? recent?.discomfort.join("、") : "暂无不适反馈"}
              tone={(summary?.abnormal_feedback_count ?? 0) > 0 ? "warning" : "neutral"}
              icon={<AlertTriangle />}
            />
          </ClinicalSummaryStrip>
          <RiskStatusPanel level={summary?.current_risk_level} title="安全边界" />
          <TaskLayout
            className="user-dashboard-layout"
            main={
              <WorkbenchSection
                title="当前阶段与处方可见性"
                description="先确认处方是否可见，再进入今日任务或审核等待。"
                actions={
                  <Space wrap>
                    <Link to="/user/health-data">
                      <Button>补充建档</Button>
                    </Link>
                    <Link to="/user/prescriptions">
                      <Button>查看处方版本</Button>
                    </Link>
                  </Space>
                }
              >
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
                      <Typography.Title level={5}>{reviewDisplayLabel}</Typography.Title>
                    </Col>
                  </Row>
                  <Tag>{summary?.prescription_summary?.cluster_label ?? "未分型"}</Tag>
                </Space>
              </WorkbenchSection>
            }
            aside={
              <aside className="workbench-side-rail user-dashboard-rail">
                <DataNote
                  title="最新反馈预警"
                  description={
                    <Space direction="vertical" size={6} className="onboarding-section">
                      <Typography.Text strong>
                        {displayValue(recent?.rpe)} / {displayValue(recent?.pain_score_after)}
                      </Typography.Text>
                      <Typography.Text type="secondary">RPE / 疼痛评分</Typography.Text>
                      <Typography.Text>{displayValue(recent?.exercise_type)} · 完成率 {displayValue(recent?.completion_rate)}%</Typography.Text>
                      <Typography.Text>异常反馈 {summary?.abnormal_feedback_count ?? 0} 次</Typography.Text>
                      <Typography.Text type="secondary">不适反馈 {(recent?.discomfort ?? []).length ? recent?.discomfort.join("、") : "无"}</Typography.Text>
                    </Space>
                  }
                />
                <StatusTile label="连续运动" value={`${summary?.streak_days ?? 0} 天`} detail="不是今日能否运动的判定依据" icon={<Flame />} />
                <StatusTile label="周达标" value={`${summary?.weekly_target_hits ?? 0} 次`} detail={`完成率 ${summary?.weekly_completion_rate ?? 0}%`} icon={<HeartPulse />} />
                <StatusTile label="异常反馈" value={`${summary?.abnormal_feedback_count ?? 0} 次`} detail="异常优先进入复核" tone={(summary?.abnormal_feedback_count ?? 0) ? "warning" : "neutral"} icon={<AlertTriangle />} />
              </aside>
            }
          />
          <WorkbenchSection title="趋势与监测" description="趋势用于复评和动态调整，不参与今日通行证的第一判断。">
            <Collapse
              className="secondary-analysis-collapse"
              defaultActiveKey={["reminders"]}
              items={[
                {
                  key: "reminders",
                  label: "监测提醒",
                  children: (summary?.monitoring_reminders ?? []).length ? (
                    <List
                      dataSource={summary?.monitoring_reminders ?? []}
                      renderItem={(item) => <List.Item>{item}</List.Item>}
                    />
                  ) : (
                    <EmptyState description="暂无监测提醒" />
                  )
                },
                {
                  key: "adherence",
                  label: "计划完成趋势",
                  children: (
                    <ChartCard
                      title="计划完成趋势"
                      unit="%"
                      insight="用于判断处方依从性是否稳定，低完成率时优先排查执行障碍。"
                      threshold="连续低于 60% 时建议进入复评或专家沟通。"
                    >
                      {adherenceData.length ? (
                        <AdherenceChart data={adherenceData} loading={!summary && !error} />
                      ) : (
                        <DataNote title="暂无完成趋势" description="后端尚未返回连续完成率数据，完成至少一次打卡后显示趋势。" />
                      )}
                    </ChartCard>
                  )
                },
                {
                  key: "feedback",
                  label: "反馈趋势",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <ChartCard
                          title="反馈趋势"
                          unit="RPE / 疼痛分 / 完成率%"
                          insight="用于发现运动强度过高、疼痛增加或完成率下降。"
                          threshold="RPE 偏高或疼痛升高时，不自动进阶处方。"
                        >
                          {feedbackTrendData.length ? (
                            <FeedbackTrendChart data={feedbackTrendData} loading={!summary && !error} />
                          ) : (
                            <DataNote title="暂无反馈趋势" description="RPE、疼痛或完成率记录不足时，不显示空图表。" />
                          )}
                        </ChartCard>
                      </Col>
                      <Col xs={24} lg={12}>
                        <ChartCard
                          title="健康画像雷达"
                          unit="标准化评分"
                          insight="用于概览体测、体成分和生化指标是否存在短板。"
                          threshold="资料缺失时不做单项风险推断。"
                        >
                          {healthRadarData.length ? (
                            <HealthRadarChart data={healthRadarData} loading={!summary && !error} />
                          ) : (
                            <DataNote title="健康画像待补充" description="完成体测、体成分或生化指标后生成画像雷达。" />
                          )}
                        </ChartCard>
                      </Col>
                    </Row>
                  )
                }
              ]}
            />
          </WorkbenchSection>
        </Space>
    </AppShell>
  );
}
