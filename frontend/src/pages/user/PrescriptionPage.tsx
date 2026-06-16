import { Alert, Button, Collapse, Descriptions, Dropdown, List, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, BarChart, Calendar, Clock, TrendingUp, User } from "lucide-react";

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
  ActionBar,
  ClinicalStatusBadge,
  ContraindicationList,
  DataNote,
  DecisionBanner,
  EmptyState,
  EvidenceTimeline,
  FITTVPCard,
  formatStatusLabel,
  RiskHeroBadge,
  sanitizeDisplayText,
  statusTagColor,
  StatusTile,
  VersionTimeline,
  WorkbenchSection
} from "../../components/ProductUI";

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
  const bannerTone = latest?.risk_level === "R3" ? "danger" : generationBlocked ? "warning" : latest ? "safe" : "info";
  const moreActionItems = [
    ...(canExportReport
      ? [
          { key: "docx", label: "导出 Word" },
          { key: "pdf", label: "导出 PDF" }
        ]
      : []),
    ...(latest && !generationBlocked ? [{ key: "regenerate", label: "重新生成处方" }] : [])
  ];
  const moreActions = moreActionItems.length ? (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: moreActionItems,
        onClick: ({ key }) => {
          if (key === "docx") {
            void runExportReport("docx");
          } else if (key === "pdf") {
            void runExportReport("pdf");
          } else if (key === "regenerate") {
            void runGenerate();
          }
        }
      }}
    >
      <Button aria-label="更多操作">更多操作</Button>
    </Dropdown>
  ) : null;
  const primaryAction = !latest ? (
    <Button type="primary" loading={loading} onClick={runGenerate}>
      生成处方
    </Button>
  ) : latest.risk_level === "R3" ? (
    <Link to="/user/risk-result">
      <Button type="primary">查看医学评估建议</Button>
    </Link>
  ) : latest.risk_level === "R2" && latest.status !== "PUBLISHED" ? (
    <Link to="/user/prescriptions">
      <Button type="primary">查看审核状态</Button>
    </Link>
  ) : latest.status === "PUBLISHED" ? (
    <Link to="/user/today">
      <Button type="primary">进入今日运动</Button>
    </Link>
  ) : (
    <Button type="primary" loading={loading} disabled={generationBlocked} onClick={runGenerate}>
      生成处方
    </Button>
  );
  const versionItems = [...items]
    .sort((left, right) => {
      if (right.version !== left.version) return right.version - left.version;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .map((item) => ({
      title: `v${item.version} · ${item.risk_level}`,
      description: `${item.cluster_label || "未标注分型"} · ${item.created_at}`,
      status: <Tag color={statusTagColor(item.status)}>{formatStatusLabel(item.status, "review")}</Tag>,
      active: latest?.id === item.id
    }));
  const fitt = latest?.fitt_vp ?? null;
  const fittCards = [
    { label: "频率 (Frequency)", value: fitt?.frequency ?? "-", icon: Calendar, tone: "blue" },
    { label: "强度 (Intensity)", value: fitt?.intensity ?? "-", icon: Activity, tone: "teal" },
    { label: "时间 (Time)", value: fitt?.time ?? "-", icon: Clock, tone: "indigo" },
    { label: "类型 (Type)", value: Array.isArray(fitt?.type) ? fitt.type.join("、") : fitt?.type ?? "-", icon: User, tone: "purple" },
    { label: "总量 (Volume)", value: fitt?.volume ?? "-", icon: BarChart, tone: "orange" },
    { label: "进阶 (Progression)", value: fitt?.progression ?? "-", icon: TrendingUp, tone: "rose" }
  ];

  return (
    <AppShell
      role="user"
      title="处方发布面板"
      subtitle="只展示当前允许执行的处方内容，未发布或 R3 状态自动锁定训练计划"
      statusItems={
        <>
          <ClinicalStatusBadge type="risk" value={latest?.risk_level} />
          <ClinicalStatusBadge type="review" value={latest?.status ?? "pending"} label={latest ? formatStatusLabel(latest.status, "review") : "暂无处方"} />
        </>
      }
    >
      <Space direction="vertical" size={16} className="onboarding-section">
        <section className="ue-prescription-cover" aria-label="个性化运动处方">
          <div>
            <Typography.Title level={3}>个性化运动处方</Typography.Title>
            <Typography.Paragraph>
              {latest
                ? `${latest.risk_level} · ${formatStatusLabel(latest.status, "review")} · ${latest.cluster_label || "未标注分型"}`
                : "完成建档和风险评估后生成处方。"}
            </Typography.Paragraph>
          </div>
          <Space wrap>
            <ClinicalStatusBadge type="risk" value={latest?.risk_level} />
            <ClinicalStatusBadge type="review" value={latest?.status ?? "pending"} label={latest ? formatStatusLabel(latest.status, "review") : "暂无处方"} />
          </Space>
        </section>
        {latest && !hideTrainingPlan ? (
          <section className="ue-fitt-showcase" aria-label="FITT-VP 六宫格">
            {fittCards.map((item) => {
              const Icon = item.icon;
              return (
                <div className={`ue-fitt-showcase-cell tone-${item.tone}`} key={item.label}>
                  <span aria-hidden="true">
                    <Icon />
                  </span>
                  <small>{item.label}</small>
                  <strong>{String(item.value)}</strong>
                </div>
              );
            })}
          </section>
        ) : null}
        <DecisionBanner
          tone={bannerTone}
          title={
            latest
              ? generationBlocked
                ? "当前处方未达到训练发布门槛"
                : "当前处方可查看或导出"
              : "尚未生成处方"
          }
          description={
            latest
              ? latest.risk_level === "R3"
                ? "R3 安全边界下不生成训练计划，只保留医学评估建议和安全提示。"
                : latest.status === "PUBLISHED"
                  ? "处方已发布，可以进入今日运动或导出训练报告。"
                  : "处方仍处在审核或草稿状态，发布前不展示训练动作、强度和进阶计划。"
              : "完成建档、风险筛查和分型后，可生成结构化 FITT-VP 处方。"
          }
          meta={
            <>
              <ClinicalStatusBadge type="risk" value={latest?.risk_level} />
              <ClinicalStatusBadge type="review" value={latest?.status ?? "pending"} label={latest ? formatStatusLabel(latest.status, "review") : "无处方"} />
              <ClinicalStatusBadge type="export" value={canExportReport ? "approved" : "blocked"} label={canExportReport ? "报告可导出" : "导出锁定"} />
            </>
          }
          actions={
            <ActionBar secondary={moreActions} primary={primaryAction} />
          }
        />
        {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
        <div className="status-grid">
          <StatusTile label="当前版本" value={latest ? `v${latest.version}` : "-"} detail={latest?.created_at ?? "暂无生成记录"} />
          <StatusTile label="训练可见性" value={hideTrainingPlan ? "锁定" : "可见"} detail="R2 发布前和 R3 均隐藏训练计划" tone={hideTrainingPlan ? "warning" : "safe"} />
          <StatusTile label="报告导出" value={canExportReport ? "开放" : "锁定"} detail="仅发布且非 R3 可导出" tone={canExportReport ? "safe" : "warning"} />
        </div>
        <div className="prescription-workbench-grid">
          <WorkbenchSection title="处方详情" description="发布状态、安全提示、FITT-VP 和禁忌动作保持同屏可核对。">
            <Space direction="vertical" size={16} className="onboarding-section">
            {latest ? (
              <>
                {generationBlocked ? (
                  <Alert
                    type={latest.risk_level === "R3" ? "error" : "warning"}
                    showIcon
                    message={latest.risk_level === "R3" ? "R3 不生成训练处方" : "R2 专家审核前不可重新生成训练处方"}
                  />
                ) : null}
                <RiskHeroBadge
                  level={latest.risk_level}
                  actionLabel={formatStatusLabel(latest.status, "review")}
                />
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="状态">
                    <Tag color={statusTagColor(latest.status)}>{formatStatusLabel(latest.status, "review")}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="风险等级">
                    <Space wrap>
                      <Tag>{latest.risk_level}</Tag>
                      <ClinicalStatusBadge type="risk" value={latest.risk_level} />
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
                        ? latest.evidence_refs.map((item) => sanitizeDisplayText(item.source ?? item.document_title ?? "证据")).join("；")
                        : "暂无证据来源",
                      status: "done"
                    },
                    {
                      title: "处方状态",
                      description: `${formatStatusLabel(latest.status, "review")} / v${latest.version}`,
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
                  <FITTVPCard
                    fitt={latest.fitt_vp}
                    riskLevel={latest.risk_level}
                    precautions={latest.precautions}
                    contraindications={latest.contraindications}
                  />
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
              </>
            ) : (
              <EmptyState description="暂无处方。完成六类数据、风险筛查和人群分型后，可生成结构化 FITT-VP 处方。" />
            )}
              <ActionBar
                secondary={
                  <Link to="/user/dashboard">
                    <Button>返回用户端</Button>
                  </Link>
                }
              />
            </Space>
          </WorkbenchSection>
          <aside className="workbench-side-rail">
            <VersionTimeline items={versionItems} />
            <div className="checklist-rail">
              <Typography.Title level={5}>发布门槛</Typography.Title>
              <ul>
                <li>R0/R1 可按规则生成处方。</li>
                <li>R2 必须专家审核发布后才展示训练内容。</li>
                <li>R3 不生成训练处方，也不允许导出训练报告。</li>
              </ul>
            </div>
            <DataNote
              title="报告导出记录"
              description="导出会写入审计，便于确认处方版本、格式和下载状态。"
            />
          </aside>
        </div>
        <WorkbenchSection title="处方报告留痕" description="导出记录默认折叠，避免把处方主任务挤成记录列表。">
          <Collapse
            className="secondary-analysis-collapse"
            items={[
              {
                key: "exports",
                label: (
                  <Space size={8}>
                    <span>最近导出记录</span>
                    <Tag>{exportRecords.length}</Tag>
                  </Space>
                ),
                children: exportRecords.length ? (
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
                            {formatStatusLabel(record.status, "export")}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <EmptyState description="暂无报告导出记录" />
                )
              }
            ]}
          />
        </WorkbenchSection>
      </Space>
    </AppShell>
  );
}
