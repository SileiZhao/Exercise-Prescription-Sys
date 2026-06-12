import { Alert, Button, Col, Descriptions, List, Row, Space, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  exportPhaseAssessmentPdfReport,
  exportPhaseAssessmentReport,
  getPhaseAssessment,
  type MeasurementChangeValue,
  type PhaseAssessment
} from "../../api/feedback";
import { AppShell, ChartCard, ClinicalStatusBadge, DataNote, DecisionBanner, StatusTile, WorkbenchSection } from "../../components/ProductUI";
import { FeedbackTrendChart, StageEvaluationCompareChart } from "../../components/charts";

const decisionMeta: Record<PhaseAssessment["decision"], { color: string; label: string }> = {
  NO_DATA: { color: "default", label: "暂无数据" },
  RED_ALERT: { color: "red", label: "红色预警" },
  REVIEW_REQUIRED: { color: "orange", label: "专家复核" },
  DEGRADE: { color: "gold", label: "降低负荷" },
  PROGRESS: { color: "green", label: "小幅进阶" },
  MAINTAIN: { color: "blue", label: "维持处方" }
};

const measurementGroups: Array<{
  key: string;
  label: string;
  fields: Array<{ key: string; label: string; unit?: string }>;
}> = [
  {
    key: "profile",
    label: "基础档案",
    fields: [
      { key: "weight_kg", label: "体重", unit: "kg" },
      { key: "bmi", label: "BMI" },
      { key: "waist_cm", label: "腰围", unit: "cm" }
    ]
  },
  {
    key: "fitness_test",
    label: "体质测试",
    fields: [
      { key: "sbp", label: "收缩压", unit: "mmHg" },
      { key: "dbp", label: "舒张压", unit: "mmHg" }
    ]
  },
  {
    key: "body_composition",
    label: "身体成分",
    fields: [
      { key: "body_fat_pct", label: "体脂率", unit: "%" },
      { key: "skeletal_muscle_kg", label: "骨骼肌", unit: "kg" }
    ]
  },
  {
    key: "biochemical_index",
    label: "生化指标",
    fields: [
      { key: "fbg", label: "空腹血糖", unit: "mmol/L" },
      { key: "tc", label: "总胆固醇", unit: "mmol/L" },
      { key: "tg", label: "甘油三酯", unit: "mmol/L" },
      { key: "hdl_c", label: "HDL-C", unit: "mmol/L" },
      { key: "ldl_c", label: "LDL-C", unit: "mmol/L" }
    ]
  }
];

function formatMeasure(value: MeasurementChangeValue["before"]) {
  if (value === null || value === undefined) return "--";
  if (typeof value !== "number") return String(value);
  return Number(value.toFixed(2)).toString();
}

function flattenMeasurementChanges(changes: PhaseAssessment["measurement_changes"] | undefined) {
  return measurementGroups.flatMap((group) =>
    group.fields.map((field) => ({
      group: group.label,
      label: field.label,
      unit: field.unit,
      change: changes?.[group.key]?.[field.key]
    }))
  );
}

function stageCompareValues(changes: PhaseAssessment["measurement_changes"] | undefined) {
  return flattenMeasurementChanges(changes)
    .filter((item) => typeof item.change?.before === "number" && typeof item.change?.after === "number")
    .map((item) => ({
      metric: item.label,
      previous: Number(item.change?.before),
      current: Number(item.change?.after)
    }));
}

function feedbackTrendValues(assessment: PhaseAssessment) {
  return [
    {
      date: `近${assessment.weeks}周`,
      completionRate: assessment.average_completion_rate,
      rpe: assessment.average_rpe,
      pain: assessment.pain_events
    }
  ];
}

export function PhaseReportPage() {
  const [assessment, setAssessment] = useState<PhaseAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getPhaseAssessment(4)
      .then((data) => {
        setAssessment(data);
        setError(null);
      })
      .catch(() => {
        setAssessment(null);
        setError("阶段评估加载失败，请稍后重试。");
      })
      .finally(() => setLoading(false));
  }, []);

  const meta = assessment ? decisionMeta[assessment.decision] : decisionMeta.NO_DATA;
  const bannerTone = assessment?.decision === "RED_ALERT"
    ? "danger"
    : assessment?.decision === "REVIEW_REQUIRED" || assessment?.decision === "DEGRADE"
      ? "warning"
      : assessment
        ? "safe"
        : "info";

  async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runExport(format: "docx" | "pdf") {
    setExportingFormat(format);
    setNotice(null);
    try {
      const weeks = assessment?.weeks ?? 4;
      const blob =
        format === "pdf" ? await exportPhaseAssessmentPdfReport(weeks) : await exportPhaseAssessmentReport(weeks);
      await downloadBlob(blob, `phase-assessment-${weeks}w.${format}`);
      setNotice(format === "pdf" ? "阶段 PDF 报告已导出。" : "阶段 Word 报告已导出。");
    } catch {
      setNotice("导出阶段报告失败，请确认登录状态和阶段评估数据。");
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <AppShell
      role="user"
      title="阶段报告"
      subtitle="把阶段决策、反馈安全事件和指标变化放在同一张复评报告里"
      statusItems={
        <>
          <ClinicalStatusBadge type="review" value={assessment?.decision === "REVIEW_REQUIRED" ? "pending_review" : assessment ? "approved" : "pending"} label={meta.label} />
          <ClinicalStatusBadge type="export" value={assessment ? "approved" : "pending"} label={assessment ? "报告可导出" : "等待数据"} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={bannerTone}
            title={assessment ? `阶段决策：${meta.label}` : "阶段报告待生成"}
            description={assessment?.summary ?? "完成运动反馈和阶段数据后，系统会生成进阶、维持、降负荷、复核或红色预警建议。"}
            meta={
              <>
                <ClinicalStatusBadge type="review" value={assessment?.decision === "REVIEW_REQUIRED" ? "pending_review" : assessment ? "approved" : "pending"} label={meta.label} />
                <ClinicalStatusBadge type="readiness" value={assessment ? "ready" : "degraded"} label={assessment ? `${assessment.weeks} 周周期` : "等待反馈"} />
              </>
            }
            actions={
              <Space wrap>
                <Button onClick={() => runExport("docx")} loading={exportingFormat === "docx"} disabled={!assessment}>
                  导出 Word
                </Button>
                <Button type="primary" onClick={() => runExport("pdf")} loading={exportingFormat === "pdf"} disabled={!assessment}>
                  导出 PDF
                </Button>
              </Space>
            }
          />
          {loading ? <DataNote title="阶段报告加载中" description={<Spin />} /> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          {assessment ? (
            <>
              <section className="phase-report-cover">
                <div>
                  <Typography.Text type="secondary">复评结论</Typography.Text>
                  <Typography.Title level={3}>{meta.label}</Typography.Title>
                  <Typography.Paragraph>{assessment.summary}</Typography.Paragraph>
                </div>
                <div className="phase-next-actions">
                  <Typography.Text strong>下一阶段优先建议</Typography.Text>
                  <List
                    size="small"
                    dataSource={assessment.recommendations.slice(0, 3)}
                    locale={{ emptyText: "暂无建议" }}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                </div>
              </section>
              <div className="status-grid">
                <StatusTile label="平均完成率" value={`${assessment.average_completion_rate}%`} detail={`${assessment.feedback_count} 次反馈`} tone="safe" />
                <StatusTile label="平均 RPE" value={assessment.average_rpe} detail="主观运动强度" />
                <StatusTile label="疼痛事件" value={`${assessment.pain_events} 次`} detail={`红色预警 ${assessment.red_alert_events} 次`} tone={assessment.red_alert_events ? "danger" : "warning"} />
                <StatusTile label="不适事件" value={`${assessment.discomfort_events} 次`} detail={`${assessment.weeks} 周评估周期`} tone={assessment.discomfort_events ? "warning" : "neutral"} />
              </div>
              <div className="phase-report-grid">
                <WorkbenchSection title="阶段复评摘要" description="决策、反馈次数和安全事件用于决定下一阶段处方。">
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Space>
                      <Typography.Title level={4}>4周阶段评估</Typography.Title>
                      <Tag color={meta.color}>{meta.label}</Tag>
                    </Space>
                    <Alert
                      type={assessment.decision === "RED_ALERT" ? "error" : "info"}
                      showIcon
                      message={assessment.summary}
                    />
                  <Descriptions bordered column={1} size="small">
                    <Descriptions.Item label="打卡次数">{assessment.feedback_count}次</Descriptions.Item>
                    <Descriptions.Item label="红色预警">{assessment.red_alert_events}次</Descriptions.Item>
                    <Descriptions.Item label="评估周期">{assessment.weeks}周</Descriptions.Item>
                  </Descriptions>
                  </Space>
                </WorkbenchSection>
                <aside className="workbench-side-rail">
                  <div className="checklist-rail">
                    <Typography.Title level={5}>决策含义</Typography.Title>
                    <ul>
                      <li>红色预警优先停止训练并建议医学评估。</li>
                      <li>专家复核用于异常反馈或资料不足。</li>
                      <li>进阶、维持、降负荷会影响下一版处方。</li>
                    </ul>
                  </div>
                </aside>
              </div>
              <WorkbenchSection title="趋势与变化" description="图表只展示可计算指标，缺失数据在变化列表说明原因。">
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                  <ChartCard
                    title="阶段指标对比"
                    unit="前后变化值"
                    insight="用于判断阶段复测后是否需要维持、降负荷或进入专家复核。"
                    threshold="缺失项不参与阶段结论。"
                  >
                    <StageEvaluationCompareChart data={stageCompareValues(assessment.measurement_changes)} />
                  </ChartCard>
                </Col>
                <Col xs={24} lg={10}>
                  <ChartCard
                    title="阶段反馈趋势"
                    unit="RPE / 疼痛 / 完成率%"
                    insight="用于观察主观强度、疼痛和执行率是否支持下一阶段调整。"
                    threshold="疼痛或 RPE 上升时优先保守处理。"
                  >
                    <FeedbackTrendChart data={feedbackTrendValues(assessment)} />
                  </ChartCard>
                </Col>
              </Row>
              </WorkbenchSection>
              <WorkbenchSection title="阶段变化" description="按数据域列出前后变化和缺失原因。">
                <List
                  dataSource={flattenMeasurementChanges(assessment.measurement_changes)}
                  renderItem={(item) => {
                    const change = item.change;
                    const hasDelta = change?.delta !== undefined && change?.delta !== null;
                    return (
                      <List.Item>
                        <Space direction="vertical" size={2} className="onboarding-section">
                          <Space wrap>
                            <Tag>{item.group}</Tag>
                            <Typography.Text strong>{item.label}</Typography.Text>
                            {item.unit ? <Typography.Text type="secondary">{item.unit}</Typography.Text> : null}
                          </Space>
                          {hasDelta ? (
                            <Space>
                              <Typography.Text>
                                {formatMeasure(change?.before)} → {formatMeasure(change?.after)}
                              </Typography.Text>
                              <Tag color={Number(change?.delta) > 0 ? "blue" : "green"}>
                                {formatMeasure(change?.delta)}
                              </Tag>
                            </Space>
                          ) : (
                            <Typography.Text type="secondary">
                              {change?.null_reason ?? "当前指标记录不足，无法计算阶段变化"}
                            </Typography.Text>
                          )}
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              </WorkbenchSection>
              <WorkbenchSection title="下一阶段建议" description="建议仍需结合安全边界和处方发布状态执行。">
                <List
                  dataSource={assessment.recommendations}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                  locale={{ emptyText: "暂无建议" }}
                />
              </WorkbenchSection>
            </>
          ) : null}
          <Space>
            <Link to="/user/today">
              <Button>继续打卡</Button>
            </Link>
            <Link to="/user/prescriptions">
              <Button>我的处方</Button>
            </Link>
          </Space>
        </Space>
    </AppShell>
  );
}
