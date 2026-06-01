import { Alert, Button, Card, Descriptions, Layout, List, Space, Spin, Statistic, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  exportPhaseAssessmentPdfReport,
  exportPhaseAssessmentReport,
  getPhaseAssessment,
  type PhaseAssessment
} from "../../api/feedback";

const decisionMeta: Record<PhaseAssessment["decision"], { color: string; label: string }> = {
  NO_DATA: { color: "default", label: "暂无数据" },
  RED_ALERT: { color: "red", label: "红色预警" },
  REVIEW_REQUIRED: { color: "orange", label: "专家复核" },
  DEGRADE: { color: "gold", label: "降低负荷" },
  PROGRESS: { color: "green", label: "小幅进阶" },
  MAINTAIN: { color: "blue", label: "维持处方" }
};

export function PhaseReportPage() {
  const [assessment, setAssessment] = useState<PhaseAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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
    setExporting(true);
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
      setExporting(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          阶段报告
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          {loading ? (
            <Card>
              <Spin />
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
                    <Card size="small">
                      <Statistic title="平均完成率" value={assessment.average_completion_rate} suffix="%" />
                      <Typography.Text>{assessment.average_completion_rate}%</Typography.Text>
                    </Card>
                    <Card size="small">
                      <Statistic title="平均RPE" value={assessment.average_rpe} />
                    </Card>
                    <Card size="small">
                      <Statistic title="疼痛事件" value={assessment.pain_events} suffix="次" />
                      <Typography.Text>{assessment.pain_events}次</Typography.Text>
                    </Card>
                    <Card size="small">
                      <Statistic title="不适事件" value={assessment.discomfort_events} suffix="次" />
                    </Card>
                  </div>
                  <Descriptions bordered column={1} size="small">
                    <Descriptions.Item label="打卡次数">{assessment.feedback_count}次</Descriptions.Item>
                    <Descriptions.Item label="红色预警">{assessment.red_alert_events}次</Descriptions.Item>
                    <Descriptions.Item label="评估周期">{assessment.weeks}周</Descriptions.Item>
                  </Descriptions>
                </Space>
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
            <Button onClick={() => runExport("docx")} loading={exporting}>
              导出阶段报告 Word
            </Button>
            <Button onClick={() => runExport("pdf")} loading={exporting}>
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
      </Layout.Content>
    </Layout>
  );
}
