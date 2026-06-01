import { Alert, Button, Card, Descriptions, Layout, List, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  exportPrescriptionPdfReport,
  exportPrescriptionReport,
  generatePrescription,
  listReportExportRecords,
  listMyPrescriptions,
  type ReportExportRecord,
  type PrescriptionRecord
} from "../../api/prescriptions";

const statusColor: Record<string, string> = {
  PUBLISHED: "green",
  PENDING_REVIEW: "orange",
  REFERRED: "red"
};

export function PrescriptionPage() {
  const [items, setItems] = useState<PrescriptionRecord[]>([]);
  const [exportRecords, setExportRecords] = useState<ReportExportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await listMyPrescriptions());
    } catch {
      setItems([]);
    }
    try {
      const records = await listReportExportRecords();
      setExportRecords(records.items);
    } catch {
      setExportRecords([]);
    }
  }

  async function runGenerate() {
    setLoading(true);
    setNotice(null);
    try {
      const record = await generatePrescription();
      setItems([record, ...items]);
      setNotice(record.status === "PENDING_REVIEW" ? "处方初稿已进入专家审核。" : "处方已生成。");
    } catch {
      setNotice("生成处方失败，请先完成建档、风险筛查和分型。");
    } finally {
      setLoading(false);
    }
  }

  async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runExportReport(format: "docx" | "pdf") {
    if (!latest) {
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const blob =
        format === "pdf" ? await exportPrescriptionPdfReport(latest.id) : await exportPrescriptionReport(latest.id);
      await downloadBlob(blob, `prescription-${latest.id}-v${latest.version}.${format}`);
      await refresh();
      setNotice(format === "pdf" ? "处方 PDF 报告已导出。" : "处方 Word 报告已导出。");
    } catch {
      setNotice("导出处方报告失败，请确认处方状态和登录权限。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const latest = items[0];

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          我的处方
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Card className="prescription-card">
          <Space direction="vertical" size={16} className="onboarding-section">
            <Alert type="warning" showIcon message="R2 处方必须专家审核后发布，R3 不生成训练计划。" />
            {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
            <Space>
              <Button type="primary" loading={loading} onClick={runGenerate}>
                生成处方
              </Button>
              <Link to="/user/dashboard">
                <Button>返回用户端</Button>
              </Link>
              {latest ? (
                <>
                  <Button onClick={() => runExportReport("docx")}>导出处方报告 Word</Button>
                  <Button onClick={() => runExportReport("pdf")}>导出处方报告 PDF</Button>
                </>
              ) : null}
            </Space>
            {latest ? (
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="状态">
                  <Tag color={statusColor[latest.status] || "blue"}>{latest.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="风险等级">{latest.risk_level}</Descriptions.Item>
                <Descriptions.Item label="分型">{latest.cluster_label || "-"}</Descriptions.Item>
                <Descriptions.Item label="FITT-VP">
                  {latest.fitt_vp ? JSON.stringify(latest.fitt_vp) : "当前为转介/安全提醒，不生成训练计划"}
                </Descriptions.Item>
                <Descriptions.Item label="安全提示">{latest.safety_notice || "-"}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Paragraph>
                暂无处方。完成六类数据、风险筛查和人群分型后，可生成结构化 FITT-VP 处方。
              </Typography.Paragraph>
            )}
            <Typography.Title level={4}>最近导出记录</Typography.Title>
            <List
              bordered
              locale={{ emptyText: "暂无报告导出记录" }}
              dataSource={exportRecords}
              renderItem={(record) => (
                <List.Item>
                  <Space direction="vertical" size={4}>
                    <Typography.Text strong>{record.filename}</Typography.Text>
                    <Typography.Text>{`${record.report_type} / ${record.format.toUpperCase()}`}</Typography.Text>
                    <Typography.Text type="secondary">
                      {record.report_type} / {record.format.toUpperCase()} · 风险 {record.risk_level || "-"} · 状态{" "}
                      {record.status || "-"}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        </Card>
      </Layout.Content>
    </Layout>
  );
}
