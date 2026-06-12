import { Alert, Button, Card, Col, Descriptions, List, Row, Space, Skeleton, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  exportPhaseAssessmentPdfReport,
  exportPhaseAssessmentReport,
  getPhaseAssessment,
  type MeasurementChangeValue,
  type PhaseAssessment
} from "../../api/feedback";
import { AppShell, ChartCard, MetricCard } from "../../components/ProductUI";
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
    <AppShell role="user" title="阶段评估报告">
        <Space direction="vertical" size={16} className="onboarding-section">
          <Typography.Text type="secondary">阶段报告</Typography.Text>
          {loading ? (
            <Card aria-label="阶段评估报告加载中">
              <Skeleton active paragraph={{ rows: 4 }} />
            </Card>
          ) : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          {assessment ? (
            <>
              <Card>
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
                  <div className="stats-grid">
                    <MetricCard title="平均完成率" value={assessment.average_completion_rate} suffix="%" />
                    <MetricCard title="平均RPE" value={assessment.average_rpe} />
                    <MetricCard title="疼痛事件" value={assessment.pain_events} suffix="次" />
                    <MetricCard title="不适事件" value={assessment.discomfort_events} suffix="次" />
                  </div>
                  <Descriptions bordered column={1} size="small">
                    <Descriptions.Item label="打卡次数">{assessment.feedback_count}次</Descriptions.Item>
                    <Descriptions.Item label="红色预警">{assessment.red_alert_events}次</Descriptions.Item>
                    <Descriptions.Item label="评估周期">{assessment.weeks}周</Descriptions.Item>
                  </Descriptions>
                </Space>
              </Card>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                  <ChartCard title="阶段指标对比">
                    <StageEvaluationCompareChart data={stageCompareValues(assessment.measurement_changes)} />
                  </ChartCard>
                </Col>
                <Col xs={24} lg={10}>
                  <ChartCard title="阶段反馈趋势">
                    <FeedbackTrendChart data={feedbackTrendValues(assessment)} />
                  </ChartCard>
                </Col>
              </Row>
              <Card title="阶段变化">
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
              </Card>
              <Card title="下一阶段建议">
                <List
                  dataSource={assessment.recommendations}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                  locale={{ emptyText: "暂无建议" }}
                />
              </Card>
            </>
          ) : null}
          <Space>
            <Button onClick={() => runExport("docx")} loading={exportingFormat === "docx"}>
              导出阶段报告 Word
            </Button>
            <Button onClick={() => runExport("pdf")} loading={exportingFormat === "pdf"}>
              导出阶段报告 PDF
            </Button>
            <Link to="/user/today">
              <Button type="primary">继续打卡</Button>
            </Link>
            <Link to="/user/prescriptions">
              <Button>我的处方</Button>
            </Link>
          </Space>
        </Space>
    </AppShell>
  );
}
