import { Alert, Button, Collapse, Tag } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  ListChecks,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Timer
} from "lucide-react";

import { getHealthSnapshot, type HealthSnapshot } from "../../api/healthData";
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ChartCard,
  ClinicalStatusBadge,
  DataNote,
  EmptyState,
  formatStatusLabel,
  RiskBadge,
  sanitizeDisplayText
} from "../../components/ProductUI";
import { AdherenceChart, FeedbackTrendChart, HealthRadarChart } from "../../components/charts";

function displayValue(value: string | number | null | undefined, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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
  if (!recent) return [];
  const rpe = numericValue(recent.rpe);
  const pain = numericValue(recent.pain_score_after);
  const completionRate = numericValue(recent.completion_rate);
  if (rpe === null && pain === null && completionRate === null) return [];
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
    if (parsed !== null) data.push({ metric, value: parsed, max });
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
  if (summary?.health_radar?.length) return summary.health_radar;
  const fromSnapshot = snapshotRadar(snapshot);
  if (fromSnapshot.length) return fromSnapshot;
  if (!summary) return [];
  return [
    { metric: "本周完成率", value: numericValue(summary.weekly_completion_rate) ?? 0, max: 100 },
    { metric: "连续运动", value: numericValue(summary.streak_days) ?? 0, max: 14 },
    { metric: "周达标", value: numericValue(summary.weekly_target_hits) ?? 0, max: 7 },
    { metric: "异常反馈", value: numericValue(summary.abnormal_feedback_count) ?? 0, max: 10 }
  ];
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// PLACEHOLDER_RENDER

const RISK_TONE: Record<string, "safe" | "info" | "warning" | "danger"> = {
  R0: "safe",
  R1: "info",
  R2: "warning",
  R3: "danger"
};

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

  const risk = summary?.current_risk_level ?? "未评估";
  const tone = RISK_TONE[risk] ?? "info";
  const canExercise = Boolean(summary?.today_can_exercise);
  const canExerciseText = canExercise ? "可运动" : "不可运动";
  const reviewDisplayLabel = summary?.expert_review_status
    ? formatStatusLabel(summary.expert_review_status, "review")
    : sanitizeDisplayText(summary?.review_status_label ?? "待评估", "review") || "待评估";

  const heroTone = canExercise ? "safe" : risk === "R3" ? "danger" : "warning";
  const heroTitle = canExercise
    ? "今日可运动"
    : risk === "R3"
      ? "今日不可运动，建议医学评估"
      : risk === "R2"
        ? "今日不可运动，等待专家审核"
        : "今日不可运动，请先完成评估";
  const heroDesc =
    summary?.today_block_reason ||
    (canExercise
      ? "当前风险与审核状态允许进入今日任务，运动前仍需确认胸痛、晕厥、严重气短等红旗信号。"
      : "请先完成建档、风险判定或处方审核，再进入运动任务。");
  const gateLabel =
    risk === "R3" ? "训练入口阻断" : risk === "R2" && !canExercise ? "训练入口锁定" : "训练入口开放";

  const primaryRoute =
    risk === "R3"
      ? "/user/risk-result"
      : canExercise
        ? "/user/today"
        : risk === "R2"
          ? "/user/prescriptions"
          : "/user/health-data";
  const primaryLabel =
    risk === "R3"
      ? "查看医学评估建议"
      : canExercise
        ? "进入运动前安全闸门"
        : risk === "R2"
          ? "查看审核状态"
          : "补充建档资料";

  const canShowFitt =
    risk !== "R3" &&
    (risk !== "R2" ||
      canExercise ||
      ["已发布", "PUBLISHED", "APPROVED"].includes(String(summary?.review_status_label ?? summary?.expert_review_status)));

  const recent = summary?.recent_feedback;
  const fitt = summary?.prescription_summary?.fitt_vp as Record<string, unknown> | undefined | null;
  const fittTypes = listValue(fitt?.type);
  const stageGoals = (summary?.current_stage_goals ?? []).join(" / ") || "尚未设置阶段目标";

  const adherenceData = (summary?.plan_completion_trend ?? []).map((completionRate, index) => ({
    label: `第${index + 1}次`,
    completionRate,
    targetRate: 80
  }));
  const feedbackTrendData = fallbackFeedbackTrend(summary);
  const healthRadarData = fallbackHealthRadar(summary, healthSnapshot);
  const reminders = summary?.monitoring_reminders ?? [];

  const nextSteps = [
    canExercise
      ? { to: "/user/today", title: "今日运动打卡", desc: "先过安全闸门，再记录 RPE 与反馈", icon: <Activity /> }
      : { to: "/user/health-data", title: "补充建档资料", desc: "完善六类数据以更新风险判定", icon: <ListChecks /> },
    { to: "/user/prescriptions", title: "查看处方与版本", desc: "确认 FITT-VP、禁忌与发布状态", icon: <Stethoscope /> },
    { to: "/user/phase-report", title: "阶段评估报告", desc: "查看复评决策与指标变化", icon: <CalendarDays /> }
  ];

  return (
    <AppShell
      role="user"
      title="今日通行证"
      subtitle={`${risk} · ${reviewDisplayLabel}`}
      statusItems={
        <>
          <ClinicalStatusBadge type="risk" value={summary?.current_risk_level} />
          <ClinicalStatusBadge type="review" value={summary?.expert_review_status ?? "pending"} label={reviewDisplayLabel} />
          <ClinicalStatusBadge type="exercise" value={canExercise} label={canExerciseText} />
        </>
      }
    >
      <div className={`ue-scope tone-${heroTone}`}>
        {error ? <Alert type="error" showIcon message="加载用户看板失败，请稍后重试。" /> : null}

        <section className="ue-hero" aria-label="今日运动决策">
          <div className="ue-disc">
            <span className="ue-disc-grade">{risk}</span>
            <span className="ue-disc-icon" aria-hidden="true">
              {heroTone === "safe" ? <CheckCircle2 /> : heroTone === "danger" ? <ShieldAlert /> : <Lock />}
            </span>
          </div>
          <div className="ue-hero-body">
            <span className="ue-hero-eyebrow">
              <Stethoscope aria-hidden="true" />
              今日运动决策 · 审核状态 {reviewDisplayLabel}
            </span>
            <h2 className="ue-hero-title">{heroTitle}</h2>
            <p className="ue-hero-desc">
              {heroDesc} 当前状态为 {risk}，审核状态为 {reviewDisplayLabel}。
            </p>
          </div>
          <div className="ue-hero-aside">
            <span className="ue-gate-chip">
              {gateLabel === "训练入口开放" ? <CheckCircle2 aria-hidden="true" /> : <Lock aria-hidden="true" />}
              {gateLabel}
            </span>
            <Link className="ue-cta" to={primaryRoute}>
              {primaryLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <div className="ue-status-row">
          <StatCard
            tone={risk === "R3" ? "danger" : risk === "R2" ? "warning" : "safe"}
            icon={<ShieldCheck />}
            label="安全状态"
            value={<RiskBadge level={summary?.current_risk_level} />}
            detail={risk === "R3" ? "仅显示医学评估建议" : "按停止信号自我监测"}
          />
          <StatCard
            tone={canExercise ? "safe" : "warning"}
            icon={<Activity />}
            label="执行状态"
            value={canExerciseText}
            detail={`本周完成率 ${summary?.weekly_completion_rate ?? 0}%`}
          />
          <StatCard
            tone={(summary?.abnormal_feedback_count ?? 0) > 0 ? "warning" : "neutral"}
            icon={<AlertTriangle />}
            label="近期异常"
            value={`${summary?.abnormal_feedback_count ?? 0} 次`}
            detail={(recent?.discomfort ?? []).length ? recent?.discomfort.join("、") : "暂无不适反馈"}
          />
        </div>

        <div className="ue-grid">
          <div className="ue-col">
            <Panel
              icon={<ListChecks />}
              title="当前阶段与处方可见性"
              sub="先确认处方是否可见，再进入今日任务"
              extra={
                <Link className="ue-panel-link" to="/user/prescriptions">
                  查看处方版本
                </Link>
              }
            >
              <div className="ue-boundary" aria-label="安全边界">
                <span className="ue-boundary-ic" aria-hidden="true">
                  {risk === "R3" ? <ShieldAlert /> : risk === "R2" ? <Lock /> : <ShieldCheck />}
                </span>
                <div>
                  <div className="ue-boundary-title">安全边界</div>
                  <p className="ue-boundary-text">{boundaryText(risk)}</p>
                </div>
              </div>

              <div>
                <div className="ue-subhead">当前阶段目标</div>
                <div className="ue-stage-goal">{stageGoals}</div>
              </div>

              {canShowFitt && fitt ? (
                <div>
                  <div className="ue-subhead">FITT-VP 处方结构</div>
                  <div className="ue-fitt">
                    <FittCell icon={<CalendarDays />} label="频率" value={displayValue(fitt.frequency as string)} />
                    <FittCell icon={<Gauge />} label="强度" value={displayValue(fitt.intensity as string)} />
                    <FittCell icon={<Timer />} label="时间" value={displayValue(fitt.time as string)} />
                  </div>
                  {fittTypes.length ? (
                    <div className="ue-chips" style={{ marginTop: 12 }}>
                      {fittTypes.map((t) => (
                        <span className="ue-chip is-type" key={t}>
                          <Footprints aria-hidden="true" style={{ width: 13, height: 13 }} />
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : risk === "R2" ? (
                <Alert
                  type="warning"
                  showIcon
                  message="专家审核中"
                  description="R2 审核通过前不展示训练动作、强度和开始训练入口。"
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="当前不展示训练计划"
                  description="仅显示安全提醒和医学评估建议。"
                />
              )}

              {summary?.prescription_summary?.safety_notice ? (
                <Alert type="info" showIcon message={summary.prescription_summary.safety_notice} />
              ) : null}

              <dl className="ue-defs">
                <div className="ue-def">
                  <dt>处方版本</dt>
                  <dd>{summary?.prescription_version ? `v${summary.prescription_version}` : "-"}</dd>
                </div>
                <div className="ue-def">
                  <dt>下次复评</dt>
                  <dd>{displayValue(summary?.next_reassessment_date)}</dd>
                </div>
                <div className="ue-def">
                  <dt>专家审核状态</dt>
                  <dd style={{ fontSize: 14 }}>{reviewDisplayLabel}</dd>
                </div>
              </dl>
              <div>
                <Tag>{summary?.prescription_summary?.cluster_label ?? "未分型"}</Tag>
              </div>
            </Panel>
          </div>

          <aside className="ue-rail" aria-label="反馈与监测概览">
            <div className="ue-feedback">
              <div className="ue-subhead">最新反馈预警</div>
              <div className="ue-feedback-metric">
                <b>{displayValue(recent?.rpe)} / {displayValue(recent?.pain_score_after)}</b>
                <span>RPE / 疼痛评分</span>
              </div>
              <div className="ue-feedback-meta">
                {displayValue(recent?.exercise_type)} · 完成率 {displayValue(recent?.completion_rate)}%
              </div>
              <div className="ue-feedback-meta">
                异常反馈 {summary?.abnormal_feedback_count ?? 0} 次 · 不适
                {(recent?.discomfort ?? []).length ? ` ${recent?.discomfort.join("、")}` : " 无"}
              </div>
            </div>
            <div className="ue-minis">
              <MiniStat icon={<Flame />} label="连续运动" value={`${summary?.streak_days ?? 0} 天`} detail="非今日判定依据" />
              <MiniStat icon={<HeartPulse />} label="周达标" value={`${summary?.weekly_target_hits ?? 0} 次`} detail={`完成率 ${summary?.weekly_completion_rate ?? 0}%`} />
              <MiniStat
                icon={<AlertTriangle />}
                label="异常反馈"
                value={`${summary?.abnormal_feedback_count ?? 0} 次`}
                detail="异常优先进入复核"
                tone={(summary?.abnormal_feedback_count ?? 0) ? "warning" : undefined}
              />
            </div>
            <div className="ue-nextsteps" aria-label="下一步建议">
              <div className="ue-subhead">下一步</div>
              {nextSteps.map((step) => (
                <Link className="ue-nextstep" to={step.to} key={step.to}>
                  <span className="ue-nextstep-ic" aria-hidden="true">{step.icon}</span>
                  <span className="ue-nextstep-copy">
                    <strong>{step.title}</strong>
                    <small>{step.desc}</small>
                  </span>
                  <ArrowRight className="ue-nextstep-arrow" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </aside>
        </div>

        <Panel icon={<Activity />} title="趋势与监测" sub="趋势用于复评和动态调整，不参与今日通行证的第一判断">
          <Collapse
            className="ue-collapse"
            defaultActiveKey={["reminders"]}
            items={[
              {
                key: "reminders",
                label: "监测提醒",
                children: reminders.length ? (
                  <ul className="ue-reminder-list">
                    {reminders.map((item) => (
                      <li key={item}>
                        <HeartPulse aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
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
                      <DataNote title="暂无完成趋势" description="完成至少一次打卡后显示趋势。" />
                    )}
                  </ChartCard>
                )
              },
              {
                key: "feedback",
                label: "反馈趋势",
                children: (
                  <div className="ue-chart-pair">
                    <ChartCard
                      title="反馈趋势"
                      unit="RPE / 疼痛分 / 完成率%"
                      insight="用于发现运动强度过高、疼痛增加或完成率下降。"
                      threshold="RPE 偏高或疼痛升高时，不自动进阶处方。"
                    >
                      {feedbackTrendData.length ? (
                        <FeedbackTrendChart data={feedbackTrendData} loading={!summary && !error} />
                      ) : (
                        <DataNote title="暂无反馈趋势" description="RPE、疼痛或完成率记录不足时不显示空图表。" />
                      )}
                    </ChartCard>
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
                  </div>
                )
              }
            ]}
          />
        </Panel>
      </div>
    </AppShell>
  );
}

function boundaryText(risk: string) {
  switch (risk) {
    case "R0":
      return "可按自动生成的基础处方执行，仍需按停止信号自我监测。";
    case "R1":
      return "可执行改善处方，关注体重、久坐和运动反馈变化。";
    case "R2":
      return "审核通过后才展示训练入口，审核前不展示开始训练入口，不允许自行训练。";
    case "R3":
      return "仅显示医学评估建议，不展示训练动作、强度、组数或进阶计划。";
    default:
      return "请先完成风险筛查后再查看处方路径。";
  }
}

function StatCard({
  tone,
  icon,
  label,
  value,
  detail
}: {
  tone: "safe" | "warning" | "danger" | "info" | "neutral";
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className={`ue-stat tone-${tone}`}>
      <span className="ue-stat-ic" aria-hidden="true">{icon}</span>
      <div className="ue-stat-body">
        <span className="ue-stat-label">{label}</span>
        <span className="ue-stat-value">{value}</span>
        {detail ? <span className="ue-stat-detail">{detail}</span> : null}
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  sub,
  extra,
  children
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ue-panel">
      <div className="ue-panel-head">
        <span className="ue-panel-head-ic" aria-hidden="true">{icon}</span>
        <div>
          <h3 className="ue-panel-title">{title}</h3>
          {sub ? <p className="ue-panel-sub">{sub}</p> : null}
        </div>
        {extra ? <div className="ue-panel-head-spacer">{extra}</div> : null}
      </div>
      <div className="ue-panel-body">{children}</div>
    </section>
  );
}

function FittCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="ue-fitt-cell">
      <span className="ue-fitt-cell-head">
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: "warning";
}) {
  return (
    <div className={`ue-mini${tone ? ` tone-${tone}` : ""}`}>
      <span className="ue-mini-ic" aria-hidden="true">{icon}</span>
      <div>
        <div className="ue-mini-label">{label}</div>
        <div className="ue-mini-value">{value}</div>
      </div>
      {detail ? <div className="ue-mini-detail">{detail}</div> : null}
    </div>
  );
}

