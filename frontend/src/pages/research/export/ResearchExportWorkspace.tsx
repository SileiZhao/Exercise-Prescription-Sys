import { Alert, Button, Card, Col, Collapse, Descriptions, Drawer, Empty, Input, List, Modal, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  approveResearchExportRequest,
  createResearchExportRequest,
  downloadResearchExportRequest,
  exportDesensitizedUsers,
  getResearchSummary,
  listResearchExportRequests,
  rejectResearchExportRequest,
  type ResearchExportFormat,
  type ResearchExportRequest,
  type ResearchSummary
} from "../../../api/researchExport";
import { AppShell, ChartCard, ClinicalStatusBadge, ClinicalSummaryStrip, DataNote, DataWorkbench, DecisionBanner, formatStatusLabel, statusTagColor, StatusTile, WorkbenchSection } from "../../../components/ProductUI";
import {
  BloodGlucoseTrendChart,
  BloodPressureTrendChart,
  ClusterScatterChart,
  FeedbackTrendChart,
  RiskDistributionChart,
  StageEvaluationCompareChart
} from "../../../components/charts";
import {
  canDownloadExport,
  clusterScatterValues,
  currentUserId,
  effectDataRows,
  effectCompare,
  exportAvailabilityColor,
  exportAvailabilityText,
  exportFieldScope,
  exportNextStep,
  exportPurposeTemplates,
  namedDataRows,
  namedValues,
  researchReadiness,
  researchRoutes,
  routeMode,
  trendDataRows,
  trendValues
} from "./researchExportModel";

export function ResearchExportWorkspace() {
  const location = useLocation();
  const isAdminMode = location.pathname.startsWith("/admin/");
  const mode = routeMode(location.pathname);
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [requests, setRequests] = useState<ResearchExportRequest[]>([]);
  const [purpose, setPurpose] = useState("");
  const [format, setFormat] = useState<ResearchExportFormat>("csv");
  const [approvalComments, setApprovalComments] = useState<Record<number, string>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "reject"; item: ResearchExportRequest } | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestDrawerOpen, setRequestDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const researcherUserId = currentUserId();
  const visibleRequests = isAdminMode
    ? requests
    : requests.filter((request) => {
        return researcherUserId !== null && request.requested_by === researcherUserId;
      });
  const requestQueue = [...visibleRequests].sort((a, b) => {
    const rank = (request: ResearchExportRequest) => {
      if (request.status === "PENDING") return 0;
      if (canDownloadExport(request)) return 1;
      if (request.status === "APPROVED") return 2;
      return 3;
    };
    return rank(a) - rank(b) || b.id - a.id;
  });
  const hiddenRequestCount = isAdminMode ? 0 : requests.length - visibleRequests.length;
  const pendingRequests = visibleRequests.filter((request) => request.status === "PENDING").length;
  const downloadableRequests = visibleRequests.filter(canDownloadExport).length;
  const rejectedRequests = visibleRequests.filter((request) => request.status === "REJECTED").length;
  const pageTitle = isAdminMode
    ? "科研导出审批"
    : mode === "dashboard"
      ? "科研数据看板"
      : mode === "cluster"
        ? "科研分型分析"
        : mode === "effects"
          ? "科研干预效果"
          : mode === "jobs"
            ? "科研导出任务"
          : "科研脱敏导出";
  const selectedRequest = visibleRequests.find((request) => request.id === selectedRequestId) ?? requestQueue[0] ?? null;
  const readiness = researchReadiness(summary, total, error);

  async function refreshRequests() {
    try {
      setRequests(await listResearchExportRequests());
    } catch {
      setRequests([]);
    }
  }

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setError(false);
    Promise.all([
      getResearchSummary(),
      listResearchExportRequests(),
      isAdminMode ? exportDesensitizedUsers().catch(() => ({ items: [], total: 0 })) : Promise.resolve({ items: [], total: 0 })
    ])
      .then(([summaryData, requestData, exportData]) => {
        if (!mounted) {
          return;
        }
        setSummary(summaryData);
        setRequests(requestData);
        setTotal(exportData.total);
        setError(false);
      })
      .catch(() => {
        if (mounted) {
          setError(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAdminMode]);

  async function submitRequest() {
    setNotice(null);
    try {
      const item = await createResearchExportRequest({ format, purpose });
      setRequests((current) => [item, ...current]);
      setPurpose("");
      setRequestDrawerOpen(false);
      setNotice("导出申请已提交，审批通过后可限时下载。");
    } catch {
      setNotice("导出申请提交失败，请确认用途和权限。");
    }
  }

  function renderMetrics() {
    return (
      <ClinicalSummaryStrip className="research-summary-strip">
        <StatusTile label="脱敏样本量" value={summary?.total_participants ?? total} detail="仅匿名编码和聚合字段" tone="info" />
        <StatusTile label="打卡记录数" value={summary?.intervention_effects.feedback_count ?? 0} detail="用于干预效果分析" />
        <StatusTile label="平均完成率" value={`${summary?.intervention_effects.average_completion_rate ?? 0}%`} detail="脱敏聚合统计" tone="safe" />
      </ClinicalSummaryStrip>
    );
  }

  function renderReadinessConclusion() {
    return (
      <Card className="dashboard-panel research-readiness-card">
        <Space direction="vertical" size={12} className="onboarding-section">
          <Space wrap>
            <ClinicalStatusBadge type="readiness" value={readiness.tone === "safe" ? "ready" : readiness.tone === "danger" ? "blocked" : "degraded"} label="分析可用性" />
            <Tag>脱敏聚合</Tag>
            <Tag>无姓名/手机号/身份证</Tag>
          </Space>
          <Typography.Title level={4}>{readiness.title}</Typography.Title>
          <Typography.Paragraph type="secondary">{readiness.description}</Typography.Paragraph>
        </Space>
      </Card>
    );
  }

  function renderOverviewCharts() {
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <ChartCard
            title="风险分布"
            unit="脱敏样本数"
            insight="用于判断当前研究样本的风险构成，不展示可识别个人信息。"
            threshold="R3 占比变化只提示样本结构，不直接推断干预效果。"
            dataRows={namedDataRows(summary?.risk_distribution, "脱敏样本")}
          >
            <RiskDistributionChart data={namedValues(summary?.risk_distribution)} loading={loading} />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard
            title="干预前后变化"
            unit="前后变化值"
            insight="用于初步观察聚合指标变化，需结合样本量和完成率解释。"
            threshold="样本不足时不输出确定性结论。"
            dataRows={effectDataRows(summary)}
          >
            <StageEvaluationCompareChart data={effectCompare(summary)} loading={loading} />
          </ChartCard>
        </Col>
      </Row>
    );
  }

  function renderResearchNavigation() {
    return (
      <nav className="research-mode-nav" aria-label="科研页面导航">
        {researchRoutes.map((item) => (
          <Link
            key={item.mode}
            to={item.href}
            className={`research-mode-link${mode === item.mode || (mode === "export" && item.mode === "jobs") ? " is-active" : ""}`}
          >
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </Link>
        ))}
      </nav>
    );
  }

  function renderExportScopeNote() {
    return (
      <div className="research-scope-grid">
        <DataNote
          title="导出前可见范围"
          description="科研端只显示脱敏聚合指标和本人申请记录，不展示姓名、手机号、真实身份字段或非本人导出任务。"
        />
        <DataNote
          title="审批后下载规则"
          description="申请通过后限时下载，下载完成后关闭再次下载入口，并写入审计日志。"
        />
      </div>
    );
  }

  function renderClusterAnalysis() {
    const overlay = summary?.cluster_risk_overlay ?? {};
    return (
      <>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <ChartCard
              title="分型统计"
              unit="脱敏样本"
              insight="用于查看分型规模和覆盖，不用于识别个体。"
              threshold="样本过少时只展示冷启动说明。"
              dataRows={namedDataRows(summary?.cluster_distribution, "脱敏样本")}
            >
              <ClusterScatterChart data={clusterScatterValues(summary?.cluster_distribution)} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} lg={10}>
            <div className="research-side-panel">
              <Typography.Text strong>风险叠加</Typography.Text>
              <List
                dataSource={Object.entries(overlay)}
                locale={{ emptyText: "暂无风险叠加数据" }}
                renderItem={([cluster, risks]) => (
                  <List.Item>
                    <Space direction="vertical" size={4}>
                      <Typography.Text strong>{cluster}</Typography.Text>
                      <Typography.Text>{Object.entries(risks).map(([risk, count]) => `${risk} ${count}`).join(" · ")}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </Col>
          <Col xs={24}>
            <DataNote
              title="冷启动说明"
              description="当分型样本不足时，仅展示脱敏聚合统计、风险叠加和处方状态，不开放可识别个体字段。"
            />
          </Col>
        </Row>
      </>
    );
  }

  function renderInterventionEffects() {
    const effects = summary?.intervention_effects;
    const completionTrend = trendValues((effects?.completion_rate_trend ?? []).map((item) => ({ date: item.date, completionRate: item.value })));
    const rpeTrend = trendValues((effects?.rpe_trend ?? []).map((item) => ({ date: item.date, rpe: item.value })));
    const painTrend = trendValues((effects?.pain_trend ?? []).map((item) => ({ date: item.date, pain: item.value })));
    const bloodPressureTrend = effects?.blood_pressure_trend ?? [];
    const bloodGlucoseTrend = effects?.blood_glucose_trend ?? [];
    const trendPanel = (
      title: string,
      values: unknown[],
      chart: JSX.Element,
      description: string
    ) =>
      loading || values.length ? (
          <ChartCard
            title={title}
            unit={title.includes("完成率") ? "%" : title.includes("RPE") || title.includes("疼痛") ? "分" : "趋势值"}
            insight="用于判断该维度是否支持进一步干预效果分析。"
            threshold="连续异常或样本不足时需要回到数据范围说明。"
            dataRows={trendDataRows(values as Array<Record<string, unknown>>, {
              value: "趋势值",
              completionRate: "完成率",
              rpe: "RPE",
              pain: "疼痛"
            })}
          >
            {chart}
          </ChartCard>
      ) : (
        <DataNote title={`${title}暂不可用`} description={description} />
      );
    return (
      <Collapse
        className="research-effect-collapse"
        defaultActiveKey={["adherence", "pain"]}
        items={[
          {
            key: "adherence",
            label: "依从性",
            children: (
              <Space direction="vertical" size={12} className="onboarding-section">
                <DataNote title="如何解读" description="先看完成率和前后变化，判断样本是否支持继续分析；低完成率时不输出确定性效果结论。" />
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <ChartCard
                      title="干预前后变化"
                      unit="前后变化值"
                      insight="用于观察干预前后聚合变化，不能替代个体临床判断。"
                      threshold="需结合脱敏样本数和反馈完整率解读。"
                      dataRows={effectDataRows(summary)}
                    >
                      <StageEvaluationCompareChart data={effectCompare(summary)} loading={loading} />
                    </ChartCard>
                  </Col>
                  <Col xs={24} lg={12}>
                    {trendPanel(
                      "完成率趋势",
                      completionTrend,
                      <FeedbackTrendChart data={completionTrend} loading={loading} />,
                      "后端尚未提供完成率趋势聚合，当前只展示平均完成率和反馈数量。"
                    )}
                  </Col>
                </Row>
              </Space>
            )
          },
          {
            key: "intensity",
            label: "主观强度",
            children: (
              <Space direction="vertical" size={12} className="onboarding-section">
                <DataNote title="如何解读" description="RPE 只用于观察主观强度趋势，连续偏高需要结合风险等级和不适反馈复核。" />
                {trendPanel(
                  "RPE趋势",
                  rpeTrend,
                  <FeedbackTrendChart data={rpeTrend} loading={loading} />,
                  "后端尚未提供 RPE 趋势聚合，当前只展示平均 RPE。"
                )}
              </Space>
            )
          },
          {
            key: "pain",
            label: "疼痛/不适",
            children: (
              <Space direction="vertical" size={12} className="onboarding-section">
                <DataNote title="如何解读" description="疼痛和不适优先级高于完成率，若趋势上升，应提示回到专家审核或规则复核。" />
                {trendPanel(
                  "疼痛趋势",
                  painTrend,
                  <FeedbackTrendChart data={painTrend} loading={loading} />,
                  "后端尚未提供疼痛变化趋势聚合，当前只展示疼痛加重计数。"
                )}
              </Space>
            )
          },
          {
            key: "physiology",
            label: "生理趋势",
            children: (
              <Space direction="vertical" size={12} className="onboarding-section">
                <DataNote title="如何解读" description="血压和血糖趋势只作为脱敏聚合观察，不能替代个体医学诊断或处方调整。" />
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    {trendPanel(
                      "血压变化趋势",
                      bloodPressureTrend,
                      <BloodPressureTrendChart data={bloodPressureTrend} loading={loading} />,
                      "后端尚未提供血压变化趋势聚合，暂不渲染空图表。"
                    )}
                  </Col>
                  <Col xs={24} lg={12}>
                    {trendPanel(
                      "血糖变化趋势",
                      bloodGlucoseTrend,
                      <BloodGlucoseTrendChart data={bloodGlucoseTrend} loading={loading} />,
                      "后端尚未提供血糖变化趋势聚合，暂不渲染空图表。"
                    )}
                  </Col>
                </Row>
              </Space>
            )
          }
        ]}
      />
    );
  }

  function renderExportJobs() {
    if (isAdminMode) {
      const approvalComment = selectedRequest ? approvalComments[selectedRequest.id] || "" : "";
      const approvalQualityOk = approvalComment.trim().length >= 8;
      return (
        <div className="research-approval-workbench">
          <div className="research-request-queue-panel">
            <Typography.Text strong>申请队列</Typography.Text>
            <List
              dataSource={requestQueue}
              locale={{ emptyText: "暂无导出申请" }}
              renderItem={(item) => (
                <List.Item
                  className={`research-request-item approval-request-item${selectedRequest?.id === item.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedRequestId(item.id)}
                >
                  <Space direction="vertical" size={4}>
                    <Space wrap>
                      <Typography.Text strong>{item.purpose}</Typography.Text>
                      <Tag color={statusTagColor(item.status)}>
                        {formatStatusLabel(item.status, "export")}
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary">{`#${item.id} · ${item.format.toUpperCase()} · 样本 ${item.row_count}`}</Typography.Text>
                    <Typography.Text type="secondary">{exportAvailabilityText(item)}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
          <Card title={selectedRequest ? `申请详情 #${selectedRequest.id}` : "申请详情"} className="dashboard-panel approval-detail-card">
            {selectedRequest ? (
              <Space direction="vertical" size={16} className="onboarding-section">
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="敏感字段检查">不包含姓名、手机号、身份证号，仅开放脱敏编号和聚合分析字段。</Descriptions.Item>
                  <Descriptions.Item label="用途">{selectedRequest.purpose}</Descriptions.Item>
                  <Descriptions.Item label="格式">{selectedRequest.format.toUpperCase()}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={exportAvailabilityColor(selectedRequest)}>{exportAvailabilityText(selectedRequest)}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="样本量">{selectedRequest.row_count}</Descriptions.Item>
                  <Descriptions.Item label="申请人">{selectedRequest.requested_by}</Descriptions.Item>
                  <Descriptions.Item label="过期时间">{selectedRequest.expires_at || "-"}</Descriptions.Item>
                  <Descriptions.Item label="下载状态">{selectedRequest.downloaded_at ? "已下载" : "未下载"}</Descriptions.Item>
                  {selectedRequest.downloaded_at ? (
                    <Descriptions.Item label="下载时间">{selectedRequest.downloaded_at}</Descriptions.Item>
                  ) : null}
                  <Descriptions.Item label="审批意见">{selectedRequest.approval_comment || "待审批"}</Descriptions.Item>
                </Descriptions>
                {selectedRequest.status === "PENDING" ? (
                  <Space direction="vertical" size={8} className="onboarding-section">
                    <label htmlFor={`research-export-approval-${selectedRequest.id}`}>{`审批意见 #${selectedRequest.id}`}</label>
                    <Input.TextArea
                      id={`research-export-approval-${selectedRequest.id}`}
                      aria-label={`审批意见 #${selectedRequest.id}`}
                      rows={4}
                      value={approvalComment}
                      onChange={(event) =>
                        setApprovalComments((current) => ({ ...current, [selectedRequest.id]: event.target.value }))
                      }
                      placeholder="填写审批意见，至少 8 个字，说明用途是否合规、字段范围是否足够。"
                    />
                    <Typography.Text type={approvalQualityOk ? "secondary" : "danger"}>
                      {approvalQualityOk ? "审批意见已满足最小说明要求。" : "审批意见至少 8 个字，不能只写同意或驳回。"}
                    </Typography.Text>
                  </Space>
                ) : null}
                <div className="approval-action-bar">
                  {selectedRequest.status === "PENDING" ? (
                    <>
                      <Button
                        type="primary"
                        aria-label={`批准 #${selectedRequest.id}`}
                        disabled={!approvalQualityOk}
                        onClick={() => setConfirmAction({ type: "approve", item: selectedRequest })}
                      >
                        批准 #{selectedRequest.id}
                      </Button>
                      <Button
                        aria-label={`驳回 #${selectedRequest.id}`}
                        disabled={!approvalQualityOk}
                        onClick={() => setConfirmAction({ type: "reject", item: selectedRequest })}
                      >
                        驳回 #{selectedRequest.id}
                      </Button>
                    </>
                  ) : canDownloadExport(selectedRequest) ? (
                    <Button aria-label={`下载 #${selectedRequest.id}`} onClick={() => downloadRequest(selectedRequest)}>
                      下载 #{selectedRequest.id}
                    </Button>
                  ) : (
                    <Typography.Text type="secondary">该申请当前无需审批动作。</Typography.Text>
                  )}
                </div>
              </Space>
            ) : (
              <Typography.Text type="secondary">暂无申请。</Typography.Text>
            )}
          </Card>
          <Card title="脱敏字段与审计" className="dashboard-panel">
            <Space direction="vertical" size={12} className="onboarding-section">
              <Alert type="info" showIcon message="管理员审批只核验脱敏字段范围，不展示姓名、手机号和真实身份字段。" />
              <div className="policy-strip">
                {exportFieldScope.map((field) => (
                  <Tag key={field}>{field}</Tag>
                ))}
              </div>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="可见样本">{total}</Descriptions.Item>
                <Descriptions.Item label="字段范围">脱敏编号、年龄、性别、BMI、风险等级、分型、处方状态</Descriptions.Item>
                <Descriptions.Item label="审计记录">审批、驳回、下载均写入审计日志</Descriptions.Item>
              </Descriptions>
            </Space>
          </Card>
        </div>
      );
    }

    return (
      <DataWorkbench
        className="research-export-workbench"
        filters={
          <div className="panel-toolbar">
            <div>
              <Typography.Text strong>{isAdminMode ? "审批队列" : "我的导出任务"}</Typography.Text>
              <Typography.Paragraph type="secondary">导出申请需要用途说明，审批通过后限时下载，下载后记录审计。</Typography.Paragraph>
            </div>
            {!isAdminMode ? <Button type="primary" onClick={() => setRequestDrawerOpen(true)}>提交导出申请</Button> : null}
          </div>
        }
        main={
          <div className="research-request-list-panel">
            {!isAdminMode && hiddenRequestCount > 0 ? (
              <Typography.Text type="secondary">非本人申请不可见</Typography.Text>
            ) : null}
            <List
              dataSource={requestQueue}
              locale={{ emptyText: "暂无导出申请" }}
              renderItem={(item) => (
                <List.Item
                  className={`research-request-item${selectedRequest?.id === item.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedRequestId(item.id)}
                >
                  <Space direction="vertical" size={4}>
                    <Space wrap>
                      <Typography.Text strong>{`#${item.id} ${item.format.toUpperCase()}`}</Typography.Text>
                      <Tag color={statusTagColor(item.status)}>{formatStatusLabel(item.status, "export")}</Tag>
                      <Tag color={exportAvailabilityColor(item)}>{exportAvailabilityText(item)}</Tag>
                    </Space>
                    <Typography.Text>{item.purpose}</Typography.Text>
                    <Typography.Text type="secondary">{`样本 ${item.row_count} · 下一步：${exportNextStep(item)}`}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        }
        detail={
          <div className="research-request-detail-panel">
            {selectedRequest ? (
              <Space direction="vertical" size={12} className="onboarding-section">
                <Typography.Text strong>{`申请详情 #${selectedRequest.id}`}</Typography.Text>
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="用途">{selectedRequest.purpose}</Descriptions.Item>
                  <Descriptions.Item label="格式">{selectedRequest.format.toUpperCase()}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={exportAvailabilityColor(selectedRequest)}>{exportAvailabilityText(selectedRequest)}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="样本量">{selectedRequest.row_count}</Descriptions.Item>
                  <Descriptions.Item label="过期时间">{selectedRequest.expires_at || "-"}</Descriptions.Item>
                  <Descriptions.Item label="下载状态">{selectedRequest.downloaded_at ? "已下载" : "未下载"}</Descriptions.Item>
                  {selectedRequest.downloaded_at ? (
                    <Descriptions.Item label="下载时间">{selectedRequest.downloaded_at}</Descriptions.Item>
                  ) : null}
                  <Descriptions.Item label="审批意见">{selectedRequest.approval_comment || "待审批"}</Descriptions.Item>
                </Descriptions>
                {canDownloadExport(selectedRequest) ? (
                  <Button aria-label={`下载 #${selectedRequest.id}`} onClick={() => downloadRequest(selectedRequest)}>
                    下载 #{selectedRequest.id}
                  </Button>
                ) : (
                  <DataNote title="当前不可下载" description={exportNextStep(selectedRequest)} />
                )}
              </Space>
            ) : (
              <Empty description="暂无选中申请" />
            )}
          </div>
        }
      />
    );
  }

  function renderExportRequestDrawer() {
    return (
      <Drawer title="提交导出申请" width={520} open={requestDrawerOpen} onClose={() => setRequestDrawerOpen(false)} destroyOnClose className="task-drawer">
        <Space direction="vertical" size={12} className="onboarding-section">
              <section className="drawer-field-section">
                <Typography.Text strong>基础信息</Typography.Text>
                <Typography.Paragraph type="secondary">用途说明会进入审批记录，不能只写“导出”或“分析”。</Typography.Paragraph>
                <label htmlFor="research-export-purpose">导出用途</label>
                <Input
                  id="research-export-purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="填写研究用途或课题名称"
                />
                <label htmlFor="research-export-format">导出格式</label>
                <select
                  id="research-export-format"
                  className="native-select"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as ResearchExportFormat)}
                >
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                  <option value="json">JSON</option>
                </select>
              </section>
              <section className="drawer-field-section drawer-field-section-critical">
                <Typography.Text strong>预览/证据</Typography.Text>
                <Alert type="info" showIcon message="审批通过后限时下载，下载后会关闭再次下载入口。" />
                <DataNote
                  title="字段范围预览"
                  description={
                    <Space wrap>
                      {exportFieldScope.map((field) => <Tag key={field}>{field}</Tag>)}
                    </Space>
                  }
                />
                <div className="purpose-template-row" aria-label="申请用途模板">
                  <Typography.Text strong>用途模板</Typography.Text>
                  <Space wrap>
                    {exportPurposeTemplates.map((template) => (
                      <Button key={template} onClick={() => setPurpose(template)}>
                        {template}
                      </Button>
                    ))}
                  </Space>
                </div>
              </section>
              <div className="drawer-sticky-actions">
                <Button type="primary" disabled={!purpose.trim()} onClick={() => void submitRequest()}>
                  提交导出申请
                </Button>
                <Button onClick={() => setRequestDrawerOpen(false)}>取消</Button>
              </div>
              {!purpose.trim() ? (
                <Typography.Text type="secondary">填写导出用途后才能提交申请。</Typography.Text>
              ) : null}
            </Space>
      </Drawer>
    );
  }

  async function approveRequest(item: ResearchExportRequest) {
    const approval_comment = (approvalComments[item.id] || "").trim();
    if (!approval_comment) {
      setNotice("审批意见不能为空。");
      return;
    }
    setNotice(null);
    try {
      const updated = await approveResearchExportRequest(item.id, { approval_comment });
      setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));
      setApprovalComments((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice(`导出申请 #${item.id} 已审批通过。`);
    } catch {
      setNotice("审批失败，请确认申请状态和管理员权限。");
    }
  }

  async function rejectRequest(item: ResearchExportRequest) {
    const approval_comment = (approvalComments[item.id] || "").trim();
    if (!approval_comment) {
      setNotice("审批意见不能为空。");
      return;
    }
    setNotice(null);
    try {
      const updated = await rejectResearchExportRequest(item.id, { approval_comment });
      setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));
      setApprovalComments((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice(`导出申请 #${item.id} 已驳回。`);
    } catch {
      setNotice("驳回失败，请确认申请状态和管理员权限。");
    }
  }

  async function downloadRequest(item: ResearchExportRequest) {
    setNotice(null);
    try {
      const blob = await downloadResearchExportRequest(item.id);
      if (typeof URL !== "undefined" && URL.createObjectURL) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `research-export-${item.id}.${item.format}`;
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice(`导出申请 #${item.id} 已下载并记录审计日志。`);
      await refreshRequests();
    } catch {
      setNotice("下载失败，请确认申请已审批且未过期。");
    }
  }

  return (
    <AppShell
      role={isAdminMode ? "admin" : "research"}
      title={pageTitle}
      subtitle={isAdminMode ? "审批用途、格式、样本量和限时下载" : "只查看脱敏聚合数据和本人导出任务"}
      statusItems={
        <>
          <ClinicalStatusBadge type="export" value={pendingRequests ? "pending" : downloadableRequests ? "approved" : "downloaded"} label={`待审批 ${pendingRequests}`} />
          <ClinicalStatusBadge type="readiness" value={summary ? "ready" : "degraded"} label={`样本 ${summary?.total_participants ?? total}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={isAdminMode && pendingRequests ? "warning" : error ? "danger" : "info"}
            title={isAdminMode ? "导出申请审批与留痕" : "脱敏样本、分型与干预效果总览"}
            description={
              isAdminMode
                ? "仅展示审批所需的用途、格式、样本量、状态和过期时间。"
                : readiness.description
            }
            meta={
              <>
                <ClinicalStatusBadge type="export" value={pendingRequests ? "pending" : "approved"} label={`待审批 ${pendingRequests}`} />
                <ClinicalStatusBadge type="export" value={downloadableRequests ? "approved" : "downloaded"} label={`可下载 ${downloadableRequests}`} />
                <ClinicalStatusBadge type="export" value={rejectedRequests ? "rejected" : "approved"} label={`驳回 ${rejectedRequests}`} />
              </>
            }
            actions={
              mode === "jobs" && !isAdminMode ? null : (
                <Link to={isAdminMode ? "/admin/dashboard" : "/research/export-jobs"}>
                  <Button type={isAdminMode || mode === "export" ? "default" : "primary"}>{isAdminMode ? "返回运营驾驶舱" : "查看导出任务"}</Button>
                </Link>
              )
            }
          />
          {error ? <Alert type="error" showIcon message="加载科研数据失败，请确认科研权限。" /> : null}
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/">
              <Button>返回首页</Button>
            </Link>
            <Typography.Text type="secondary">
              {isAdminMode ? "管理员预览仅展示匿名编码和脱敏指标。" : "科研端仅展示脱敏聚合指标和本人导出申请。"}
            </Typography.Text>
          </Space>
          {!isAdminMode ? renderResearchNavigation() : null}
          {!isAdminMode && mode === "dashboard" ? renderReadinessConclusion() : null}
          {!isAdminMode && mode === "dashboard" ? renderMetrics() : null}
          {!isAdminMode && mode === "dashboard" ? (
            <WorkbenchSection title="科研总览" description="默认只保留最影响判断的风险分布和干预变化，其他分析进入对应页面。">
              {renderOverviewCharts()}
            </WorkbenchSection>
          ) : null}
          {!isAdminMode && mode === "export" ? renderExportScopeNote() : null}
          {mode === "cluster" ? (
            <WorkbenchSection title="分型分析" description="展示分型规模与风险叠加，不开放可识别个体字段。">
              {renderClusterAnalysis()}
            </WorkbenchSection>
          ) : null}
          {mode === "effects" ? (
            <WorkbenchSection title="干预效果" description="完成率、RPE、疼痛、血压和血糖趋势均来自脱敏聚合数据。">
              {renderInterventionEffects()}
            </WorkbenchSection>
          ) : null}
          {(mode === "jobs" || mode === "export" || isAdminMode) ? (
            <WorkbenchSection title={isAdminMode ? "导出审批队列" : "我的导出任务"} description="审批通过后限时下载，下载后记录审计并关闭再次下载入口。">
              {renderExportJobs()}
            </WorkbenchSection>
          ) : null}
          {renderExportRequestDrawer()}
          <Modal
            title={confirmAction?.type === "approve" ? "确认批准导出申请" : "确认驳回导出申请"}
            open={Boolean(confirmAction)}
            okText={confirmAction?.type === "approve" ? "确认批准" : "确认驳回"}
            cancelText="取消"
            onCancel={() => setConfirmAction(null)}
            onOk={() => {
              if (!confirmAction) return undefined;
              const action = confirmAction;
              setConfirmAction(null);
              return action.type === "approve" ? approveRequest(action.item) : rejectRequest(action.item);
            }}
          >
            <Typography.Paragraph>
              {confirmAction?.type === "approve"
                ? "批准后研究人员将在有效期内下载一次脱敏数据包，审批和下载都会写入审计日志。"
                : "驳回后研究人员需要按审批意见补充用途或字段范围后重新申请。"}
            </Typography.Paragraph>
          </Modal>
        </Space>
    </AppShell>
  );
}
