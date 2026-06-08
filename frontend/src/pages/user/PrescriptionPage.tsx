import { Alert, Button, Card, Col, Descriptions, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  exportPrescriptionPdfReport,
  exportPrescriptionReport,
  generatePrescription,
  listReportExportRecords,
  listMyPrescriptions,
  type ReportExportRecord,
  type PrescriptionRecord
} from "../../api/prescriptions";
import {
  AppShell,
  ClinicalScopePanel,
  ContraindicationList,
  EmptyState,
  EvidenceTimeline,
  FITTVPCard,
  MotionCard,
  RiskBadge,
  SafetyBoundaryChecklist
} from "../../components/ProductUI";

const statusColor: Record<string, string> = {
  PUBLISHED: "green",
  PENDING_REVIEW: "orange",
  REFERRED: "red"
};

export function PrescriptionPage() {
  const { id } = useParams();
  const [items, setItems] = useState<PrescriptionRecord[]>([]);
  const [exportRecords, setExportRecords] = useState<ReportExportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await listMyPrescriptions(true));
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
    if (!latest || !canExportReport) {
      setNotice("当前处方未发布或属于 R3 安全边界，不允许导出处方训练报告。");
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

  const routePrescriptionId = id && Number.isFinite(Number(id)) ? Number(id) : null;
  const latest = routePrescriptionId
    ? items.find((item) => item.id === routePrescriptionId) ?? items[0]
    : items[0];
  const generationBlocked =
    latest?.risk_level === "R3" ||
    (latest?.risk_level === "R2" && !["PUBLISHED", "APPROVED"].includes(latest.status));
  const hideTrainingPlan = latest?.risk_level === "R3" || (latest?.risk_level === "R2" && latest.status !== "PUBLISHED");
  const canExportReport = Boolean(latest && latest.status === "PUBLISHED" && latest.risk_level !== "R3");
  const reportStateText = canExportReport ? "报告可导出" : "报告锁定";

  return (
    <AppShell role="user" title="我的处方">
        <MotionCard className="prescription-card">
          <Space direction="vertical" size={16} className="onboarding-section">
            <ClinicalScopePanel compact />
            <SafetyBoundaryChecklist compact />
            <Alert type="warning" showIcon message="R2 处方必须专家审核后发布，R3 不生成训练计划。" />
            {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
            <Space>
              <Button type="primary" loading={loading} disabled={generationBlocked} onClick={runGenerate}>
                生成处方
              </Button>
              <Link to="/user/dashboard">
                <Button>返回用户端</Button>
              </Link>
              {latest && canExportReport ? (
                <>
                  <Button onClick={() => runExportReport("docx")}>导出处方报告 Word</Button>
                  <Button onClick={() => runExportReport("pdf")}>导出处方报告 PDF</Button>
                </>
              ) : null}
            </Space>
            {latest ? (
              <>
                <section className="prescription-safety-panel" data-testid="prescription-safety-panel">
                  <div className="prescription-safety-panel-head">
                    <div>
                      <Typography.Text className="page-hero-eyebrow">处方安全发布面板</Typography.Text>
                      <Typography.Title level={3}>{`处方 #${latest.id}`}</Typography.Title>
                    </div>
                    <Space wrap>
                      <Tag color={statusColor[latest.status] || "blue"}>{latest.status}</Tag>
                      <RiskBadge level={latest.risk_level} />
                    </Space>
                  </div>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="prescription-safety-metric">
                        <span>风险等级</span>
                        <strong>{latest.risk_level}</strong>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="prescription-safety-metric">
                        <span>处方状态</span>
                        <strong>{latest.status}</strong>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="prescription-safety-metric">
                        <span>版本</span>
                        <strong>{`v${latest.version}`}</strong>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="prescription-safety-metric">
                        <span>报告</span>
                        <strong>{reportStateText}</strong>
                      </div>
                    </Col>
                  </Row>
                </section>
                {generationBlocked ? (
                  <Alert
                    type={latest.risk_level === "R3" ? "error" : "warning"}
                    showIcon
                    message={latest.risk_level === "R3" ? "R3 不生成训练处方" : "R2 专家审核前不可重新生成训练处方"}
                  />
                ) : null}
                <Card title="结构化处方概览" className="prescription-detail-workbench" data-testid="prescription-detail-workbench">
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="状态">
                    <Tag color={statusColor[latest.status] || "blue"}>{latest.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="风险等级">
                    <Space wrap>
                      <Tag>{latest.risk_level}</Tag>
                      <RiskBadge level={latest.risk_level} />
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="分型">{latest.cluster_label || "-"}</Descriptions.Item>
                  <Descriptions.Item label="安全提示">{latest.safety_notice || "-"}</Descriptions.Item>
                  <Descriptions.Item label="复测周期">{latest.reassessment || "-"}</Descriptions.Item>
                </Descriptions>
                <EvidenceTimeline
                  items={[
                    {
                      title: "证据来源",
                      description: latest.evidence_refs?.length
                        ? latest.evidence_refs.map((item) => String(item.source ?? item.document_title ?? "证据")).join("；")
                        : "暂无证据来源",
                      status: "done"
                    },
                    {
                      title: "处方状态",
                      description: `${latest.status} / v${latest.version}`,
                      status: latest.status === "PUBLISHED" ? "done" : "active"
                    },
                    {
                      title: "禁忌动作",
                      description: latest.contraindications?.join("；") || "暂无禁忌动作",
                      status: "pending"
                    }
                  ]}
                />
                {hideTrainingPlan ? (
                  <Alert
                    type={latest.risk_level === "R3" ? "error" : "warning"}
                    showIcon
                    message={latest.risk_level === "R3" ? "当前不展示训练计划，仅显示安全提醒和医学评估建议。" : "专家审核前不展示训练计划"}
                    description={latest.risk_level === "R3" ? undefined : "R2 初稿需专家复核后才会展示动作、强度、组数和进阶计划。"}
                  />
                ) : (
                  <FITTVPCard fitt={latest.fitt_vp} riskLevel={latest.risk_level} />
                )}
                {!canExportReport ? (
                  <Alert
                    type={latest.risk_level === "R3" ? "error" : "warning"}
                    showIcon
                    message="报告导出已锁定"
                    description={
                      latest.risk_level === "R3"
                        ? "R3 仅保留医学评估建议，不提供训练处方报告导出。"
                        : "处方发布前不提供 Word/PDF 训练报告导出，防止未审核计划流出。"
                    }
                  />
                ) : null}
                <ContraindicationList items={latest.contraindications} />
                    {latest.precautions?.length ? (
                      <Alert type="info" showIcon message="执行注意事项" description={latest.precautions.join("；")} />
                    ) : null}
                  </Space>
                </Card>
              </>
            ) : (
              <EmptyState
                title="尚未生成处方"
                description="完成六类数据、风险筛查和人群分型后，可生成结构化 FITT-VP 处方。"
                action={
                  <Space wrap>
                    <Link to="/user/onboarding">
                      <Button type="primary">继续建档</Button>
                    </Link>
                    <Button loading={loading} onClick={runGenerate}>尝试生成处方</Button>
                  </Space>
                }
              />
            )}
            <Typography.Title level={4}>报告导出审计</Typography.Title>
            {exportRecords.length ? (
              <List
                bordered
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
            ) : (
              <EmptyState
                title="暂无报告导出记录"
                description={canExportReport ? "当前处方已发布，可导出首份 Word 或 PDF 报告。" : "处方发布前不会生成训练报告导出记录。"}
                action={
                  canExportReport ? (
                    <Space wrap>
                      <Button onClick={() => runExportReport("docx")}>导出 Word 报告</Button>
                      <Button onClick={() => runExportReport("pdf")}>导出 PDF 报告</Button>
                    </Space>
                  ) : (
                    <Link to="/user/dashboard">
                      <Button>查看今日安全状态</Button>
                    </Link>
                  )
                }
              />
            )}
          </Space>
        </MotionCard>
    </AppShell>
  );
}
