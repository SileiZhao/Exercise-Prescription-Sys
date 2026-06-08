import { Alert, Button, Card, Col, Empty, Input, List, Row, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Database, FlaskConical, ListChecks } from "lucide-react";

import {
  approveResearchExportRequest,
  createResearchExportRequest,
  downloadResearchExportRequest,
  exportDesensitizedUsers,
  getResearchSummary,
  listResearchExportRequests,
  rejectResearchExportRequest,
  type DesensitizedUserRow,
  type ResearchExportFormat,
  type ResearchExportRequest,
  type ResearchSummary
} from "../../api/researchExport";
import { AppShell, ChartCard, MetricCard, PageHero } from "../../components/ProductUI";
import {
  BloodGlucoseTrendChart,
  BloodPressureTrendChart,
  ClusterScatterChart,
  FeedbackTrendChart,
  RiskDistributionChart,
  StageEvaluationCompareChart,
  TemplateUsageChart
} from "../../components/charts";

function namedValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([name, value]) => ({ name, value }));
}

function clusterScatterValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([cluster, count], index) => ({
    x: index + 1,
    y: count,
    cluster,
    label: `${cluster} ${count}`
  }));
}

function effectCompare(summary: ResearchSummary | null) {
  const effects = summary?.intervention_effects;
  if (!effects) return [];
  return [
    { metric: "完成率", previous: 0, current: effects.average_completion_rate },
    { metric: "RPE", previous: 0, current: effects.average_rpe },
    { metric: "不适事件", previous: 0, current: effects.discomfort_event_count },
    { metric: "疼痛加重", previous: 0, current: effects.pain_worsened_count }
  ];
}

const TREND_AGGREGATION_EMPTY_TEXT = "当前后端未提供趋势聚合字段";

function trendValues(items: Array<{ date: string; value?: number; rpe?: number; pain?: number; completionRate?: number }> = []) {
  return items;
}

function hasTrendRows<T>(items: T[] | undefined) {
  return Array.isArray(items) && items.length > 0;
}

function renderTrendEmpty() {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={TREND_AGGREGATION_EMPTY_TEXT} />;
}

function formatResearchNumber(value: number | undefined, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text}${suffix}`;
}

function exportStatusLabel(status: string) {
  if (status === "PENDING") return "待审批";
  if (status === "APPROVED") return "已审批";
  if (status === "REJECTED") return "已驳回";
  return status;
}

function exportStatusColor(status: string) {
  if (status === "PENDING") return "gold";
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  return "blue";
}

function riskTagColor(level: string) {
  if (level === "R3") return "red";
  if (level === "R2") return "orange";
  if (level === "R1") return "cyan";
  if (level === "R0") return "green";
  return "blue";
}

function noticeAlertType(message: string) {
  return message.includes("失败") || message.includes("不能为空") ? "error" : "success";
}

function currentUserId() {
  const raw = localStorage.getItem("current_user_id");
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

function routeMode(pathname: string) {
  if (pathname.endsWith("/dashboard")) return "dashboard";
  if (pathname.endsWith("/cluster-analysis")) return "cluster";
  if (pathname.endsWith("/intervention-effects")) return "effects";
  if (pathname.endsWith("/export-jobs")) return "jobs";
  return "export";
}

function parseDateTime(value: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isExportExpired(request: ResearchExportRequest) {
  const expiresAt = parseDateTime(request.expires_at);
  return expiresAt !== null && expiresAt < Date.now();
}

function isExportDownloaded(request: ResearchExportRequest) {
  return Boolean(request.downloaded_at);
}

function canDownloadExport(request: ResearchExportRequest) {
  return request.status === "APPROVED" && !isExportExpired(request) && !isExportDownloaded(request);
}

function exportAvailabilityText(request: ResearchExportRequest) {
  if (request.status !== "APPROVED") {
    return request.status === "PENDING" ? "待审批" : "已驳回";
  }
  if (isExportDownloaded(request)) {
    return "已下载";
  }
  if (isExportExpired(request)) {
    return "已过期";
  }
  return "限时可下载";
}


function ResearchPrivacyStrip({
  isAdminMode,
  summary,
  requests,
  visibleCount
}: {
  isAdminMode: boolean;
  summary: ResearchSummary | null;
  requests: ResearchExportRequest[];
  visibleCount: number;
}) {
  const pending = requests.filter((item) => item.status === "PENDING").length;
  const approved = requests.filter((item) => item.status === "APPROVED").length;
  const expired = requests.filter((item) => isExportExpired(item)).length;
  const downloaded = requests.filter((item) => isExportDownloaded(item)).length;
  return (
    <section className="research-privacy-strip" data-testid="research-privacy-strip">
      <div>
        <Typography.Text className="page-hero-eyebrow">脱敏治理</Typography.Text>
        <Typography.Title level={4}>仅展示脱敏聚合数据</Typography.Title>
        <Typography.Text type="secondary">
          姓名、手机、身份证等敏感字段永不进入科研端；导出必须审批，下载限时并写入审计。
        </Typography.Text>
      </div>
      <div className="research-privacy-kpis">
        <div><span>脱敏样本</span><strong>{summary?.total_participants ?? 0}</strong></div>
        <div><span>{isAdminMode ? "全部申请" : "本人申请"}</span><strong>{visibleCount}</strong></div>
        <div><span>待审批</span><strong>{pending}</strong></div>
        <div><span>已批准</span><strong>{approved}</strong></div>
        <div><span>已下载</span><strong>{downloaded}</strong></div>
        <div><span>已过期</span><strong>{expired}</strong></div>
      </div>
    </section>
  );
}

function exportAvailabilityColor(request: ResearchExportRequest) {
  const text = exportAvailabilityText(request);
  if (text === "限时可下载") return "green";
  if (text === "已过期" || text === "已驳回") return "red";
  if (text === "已下载") return "blue";
  return "gold";
}

export function ResearchExportPage() {
  const location = useLocation();
  const isAdminMode = location.pathname.startsWith("/admin/");
  const mode = routeMode(location.pathname);
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [rows, setRows] = useState<DesensitizedUserRow[]>([]);
  const [requests, setRequests] = useState<ResearchExportRequest[]>([]);
  const [purpose, setPurpose] = useState("");
  const [format, setFormat] = useState<ResearchExportFormat>("csv");
  const [approvalComments, setApprovalComments] = useState<Record<number, string>>({});
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
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
  const hiddenRequestCount = isAdminMode ? 0 : requests.length - visibleRequests.length;
  const selectedRequest = visibleRequests.find((request) => request.id === selectedRequestId) ?? visibleRequests[0] ?? null;
  const pageTitle = isAdminMode
    ? "科研导出审批"
    : mode === "dashboard"
      ? "研究数据控制台"
      : mode === "cluster"
        ? "科研分型分析"
        : mode === "effects"
          ? "科研干预效果"
          : mode === "jobs"
            ? "科研导出任务"
            : "科研脱敏导出";

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
        setRows(exportData.items);
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

  useEffect(() => {
    if (!visibleRequests.length) {
      setSelectedRequestId(null);
      return;
    }
    if (!selectedRequestId || !visibleRequests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(visibleRequests[0].id);
    }
  }, [selectedRequestId, visibleRequests]);

  async function submitRequest() {
    setNotice(null);
    try {
      const item = await createResearchExportRequest({ format, purpose });
      setRequests((current) => [item, ...current]);
      setSelectedRequestId(item.id);
      setPurpose("");
      setNotice("导出申请已提交，审批通过后可限时下载。");
    } catch {
      setNotice("导出申请提交失败，请确认用途和权限。");
    }
  }

  function renderMetrics() {
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <MetricCard title="脱敏样本量" value={summary?.total_participants ?? total} />
        </Col>
        <Col xs={24} md={6}>
          <MetricCard title="打卡记录数" value={summary?.intervention_effects.feedback_count ?? 0} />
        </Col>
        <Col xs={24} md={6}>
          <MetricCard title="平均完成率" value={summary?.intervention_effects.average_completion_rate ?? 0} suffix="%" />
        </Col>
        <Col xs={24} md={6}>
          <MetricCard title="平均RPE" value={summary?.intervention_effects.average_rpe ?? 0} />
        </Col>
      </Row>
    );
  }

  function renderDesensitizedTable(title = "脱敏数据明细") {
    const columns = [
      {
        title: "研究对象ID",
        dataIndex: "research_subject_id",
        key: "research_subject_id",
        fixed: "left" as const,
        render: (value: string) => value || "-"
      },
      {
        title: "年龄段",
        dataIndex: "age_band",
        key: "age_band",
        render: (value: string) => value || "-"
      },
      {
        title: "性别",
        key: "sex",
        render: (_: unknown, record: DesensitizedUserRow) => String(record.profile.sex ?? "-")
      },
      {
        title: "BMI",
        key: "bmi",
        render: (_: unknown, record: DesensitizedUserRow) => String(record.profile.bmi ?? "-")
      },
      {
        title: "风险等级",
        key: "risk_level",
        render: (_: unknown, record: DesensitizedUserRow) => {
          const level = record.risk_screening?.risk_level as string | undefined;
          return level ? <Tag color={level === "R3" ? "red" : level === "R2" ? "orange" : "blue"}>{level}</Tag> : "-";
        }
      },
      {
        title: "分型",
        key: "cluster",
        render: (_: unknown, record: DesensitizedUserRow) => (record.latest_prescription?.cluster_label as string | undefined) || "-"
      },
      {
        title: "处方状态",
        key: "status",
        render: (_: unknown, record: DesensitizedUserRow) => (record.latest_prescription?.status as string | undefined) || "-"
      }
    ];

    return (
      <Card title={title}>
        <div data-testid="research-desensitized-table">
          <Table<DesensitizedUserRow>
            columns={columns}
            dataSource={rows}
            loading={loading}
            rowKey={(record) => record.research_subject_id || record.participant_code}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            scroll={{ x: 760 }}
            locale={{ emptyText: "暂无脱敏数据" }}
            size="small"
          />
        </div>
      </Card>
    );
  }

  function renderResearchConsoleAnalytics() {
    const overlayEntries = Object.entries(summary?.cluster_risk_overlay ?? {});
    const exportStatusEntries = Object.entries(summary?.export_job_status ?? {});
    const effects = summary?.intervention_effects;
    const hasAnyTrend = Boolean(
      effects?.completion_rate_trend?.length ||
      effects?.rpe_trend?.length ||
      effects?.pain_trend?.length ||
      effects?.blood_pressure_trend?.length ||
      effects?.blood_glucose_trend?.length
    );

    return (
      <Row gutter={[16, 16]} className="research-console-analytics" data-testid="research-console-analytics">
        <Col xs={24} lg={8}>
          <Card
            className="research-console-card"
            title={
              <span className="research-console-title">
                <FlaskConical size={16} />
                风险/分型矩阵
              </span>
            }
          >
            {overlayEntries.length ? (
              <div className="research-matrix-list">
                {overlayEntries.map(([cluster, risks]) => (
                  <div className="research-matrix-row" key={cluster}>
                    <div>
                      <Typography.Text strong>{cluster}</Typography.Text>
                      <Typography.Text type="secondary">脱敏分型队列</Typography.Text>
                    </div>
                    <Space wrap size={[4, 4]}>
                      {Object.entries(risks).map(([risk, count]) => (
                        <Tag color={riskTagColor(risk)} key={`${cluster}-${risk}`}>{`${risk} ${count}`}</Tag>
                      ))}
                    </Space>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险分型矩阵" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            className="research-console-card"
            title={
              <span className="research-console-title">
                <BarChart3 size={16} />
                干预趋势摘要
              </span>
            }
          >
            <div className="research-trend-grid">
              <div className="research-trend-cell">
                <Typography.Text type="secondary">完成率</Typography.Text>
                <strong>{`完成率 ${formatResearchNumber(effects?.average_completion_rate, "%")}`}</strong>
              </div>
              <div className="research-trend-cell">
                <Typography.Text type="secondary">平均 RPE</Typography.Text>
                <strong>{formatResearchNumber(effects?.average_rpe)}</strong>
              </div>
              <div className="research-trend-cell">
                <Typography.Text type="secondary">不适事件</Typography.Text>
                <strong>{formatResearchNumber(effects?.discomfort_event_count)}</strong>
              </div>
              <div className="research-trend-cell">
                <Typography.Text type="secondary">疼痛加重</Typography.Text>
                <strong>{formatResearchNumber(effects?.pain_worsened_count)}</strong>
              </div>
            </div>
            <Tag color={hasAnyTrend ? "green" : "gold"}>
              {hasAnyTrend ? "趋势字段已接入" : TREND_AGGREGATION_EMPTY_TEXT}
            </Tag>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            className="research-console-card"
            title={
              <span className="research-console-title">
                <Database size={16} />
                导出治理
              </span>
            }
          >
            <div className="research-export-status-list">
              {exportStatusEntries.length ? (
                exportStatusEntries.map(([status, count]) => (
                  <div className="research-export-status-row" key={status}>
                    <Tag color={exportStatusColor(status)}>{`${exportStatusLabel(status)} ${count}`}</Tag>
                    <Typography.Text type="secondary">{status}</Typography.Text>
                  </div>
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出任务状态" />
              )}
            </div>
            <div className="research-governance-note">
              <ListChecks size={16} />
              <span>审批通过后限时下载，下载动作写入审计日志。</span>
            </div>
          </Card>
        </Col>
      </Row>
    );
  }

  function renderOverviewCharts() {
    const isExportOverview = mode === "export";
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <ChartCard title="风险分布">
            <RiskDistributionChart data={namedValues(summary?.risk_distribution)} loading={loading} />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard title={isExportOverview ? "分型统计" : "分型分布"}>
            <ClusterScatterChart data={clusterScatterValues(summary?.cluster_distribution)} loading={loading} />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard title="处方状态">
            <RiskDistributionChart data={namedValues(summary?.prescription_status)} loading={loading} />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard title={isExportOverview ? "干预效果" : "干预前后变化"}>
            <StageEvaluationCompareChart data={effectCompare(summary)} loading={loading} />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard title="模板效果">
            <TemplateUsageChart
              data={Object.entries(summary?.template_effects ?? {}).map(([template, count]) => ({ template, count }))}
              loading={loading}
            />
          </ChartCard>
        </Col>
        <Col xs={24} md={12}>
          <ChartCard title="导出任务状态">
            <RiskDistributionChart data={namedValues(summary?.export_job_status)} loading={loading} />
          </ChartCard>
        </Col>
      </Row>
    );
  }

  function renderClusterAnalysis() {
    const overlay = summary?.cluster_risk_overlay ?? {};
    return (
      <>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <ChartCard title="分型统计">
              <ClusterScatterChart data={clusterScatterValues(summary?.cluster_distribution)} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="风险叠加">
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
            </Card>
          </Col>
          <Col xs={24}>
            <Card title="冷启动说明">
              <Typography.Paragraph>
                当分型样本不足时，仅展示脱敏聚合统计、风险叠加和处方状态，不开放可识别个体字段。
              </Typography.Paragraph>
            </Card>
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

    return (
      <>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <ChartCard title="干预前后变化">
              <StageEvaluationCompareChart data={effectCompare(summary)} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="完成率趋势">
              {!loading && !hasTrendRows(completionTrend) ? (
                renderTrendEmpty()
              ) : (
                <FeedbackTrendChart data={completionTrend} loading={loading} />
              )}
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="RPE趋势">
              {!loading && !hasTrendRows(rpeTrend) ? renderTrendEmpty() : <FeedbackTrendChart data={rpeTrend} loading={loading} />}
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="疼痛趋势">
              {!loading && !hasTrendRows(painTrend) ? renderTrendEmpty() : <FeedbackTrendChart data={painTrend} loading={loading} />}
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="血压变化趋势">
              {!loading && !hasTrendRows(bloodPressureTrend) ? (
                renderTrendEmpty()
              ) : (
                <BloodPressureTrendChart data={bloodPressureTrend} loading={loading} />
              )}
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="血糖变化趋势">
              {!loading && !hasTrendRows(bloodGlucoseTrend) ? (
                renderTrendEmpty()
              ) : (
                <BloodGlucoseTrendChart data={bloodGlucoseTrend} loading={loading} />
              )}
            </ChartCard>
          </Col>
        </Row>
      </>
    );
  }

  function renderExportJobs() {
    const requestSummary = {
      pending: visibleRequests.filter((item) => item.status === "PENDING").length,
      approved: visibleRequests.filter((item) => item.status === "APPROVED").length,
      rejected: visibleRequests.filter((item) => item.status === "REJECTED").length
    };

    return (
      <section className="research-export-workbench" data-testid="research-export-workbench">
        <Card
          title={isAdminMode ? "审批口径" : "新建导出申请"}
          className="research-export-form-card"
          extra={<Tag color={isAdminMode ? "blue" : "cyan"}>{isAdminMode ? "管理员" : "研究者"}</Tag>}
        >
          {isAdminMode ? (
            <div className="research-approval-guardrail">
              <ListChecks size={18} />
              <div>
                <Typography.Text strong>审批前核对用途、格式、样本量和下载窗口。</Typography.Text>
                <Typography.Text type="secondary">仅允许脱敏字段导出，批准或驳回都会写入审计日志。</Typography.Text>
              </div>
            </div>
          ) : (
            <Space direction="vertical" size={12} className="research-export-form">
              <div className="research-form-field">
                <label htmlFor="research-export-purpose">导出用途</label>
                <Input
                  id="research-export-purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="填写研究用途或课题名称"
                />
              </div>
              <div className="research-form-field">
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
              </div>
              <div className="research-download-policy">
                <Database size={16} />
                <span>审批通过后限时下载，下载后自动写入审计日志。</span>
              </div>
              <Button type="primary" block onClick={submitRequest}>
                提交导出申请
              </Button>
            </Space>
          )}
          {!isAdminMode && hiddenRequestCount > 0 ? (
            <Typography.Text className="research-hidden-note" type="secondary">非本人申请不可见</Typography.Text>
          ) : null}
        </Card>

        <Card
          title="导出申请"
          className="research-export-queue-card"
          extra={
            <Space size={6} wrap>
              <Tag color="gold">{`待审批 ${requestSummary.pending}`}</Tag>
              <Tag color="green">{`APPROVED ${requestSummary.approved}`}</Tag>
              <Tag color="red">{`已驳回 ${requestSummary.rejected}`}</Tag>
            </Space>
          }
        >
          <List
            className="research-export-queue"
            dataSource={visibleRequests}
            locale={{ emptyText: "暂无导出申请" }}
            renderItem={(item) => (
              <List.Item
                className={item.id === selectedRequest?.id ? "research-export-request is-selected" : "research-export-request"}
                onClick={() => setSelectedRequestId(item.id)}
              >
                <div className="research-export-request-main">
                  <div>
                    <Typography.Text strong>{`#${item.id} ${item.format.toUpperCase()}`}</Typography.Text>
                    <Typography.Text>{item.purpose}</Typography.Text>
                  </div>
                  <Space wrap size={[6, 6]}>
                    <Tag color={exportStatusColor(item.status)}>{item.status}</Tag>
                    <Tag color={exportAvailabilityColor(item)}>{exportAvailabilityText(item)}</Tag>
                    <Typography.Text type="secondary">{`样本 ${item.row_count}`}</Typography.Text>
                  </Space>
                </div>
              </List.Item>
            )}
          />
        </Card>

        <Card title="申请详情与审计" className="research-export-detail-card">
          {selectedRequest ? (
            <Space direction="vertical" size={12} className="research-export-detail">
              <div className="research-export-detail-head">
                <div>
                  <Typography.Text className="page-hero-eyebrow">当前申请</Typography.Text>
                  <Typography.Title level={5}>{`#${selectedRequest.id} ${selectedRequest.format.toUpperCase()}`}</Typography.Title>
                </div>
                <Space wrap size={[6, 6]}>
                  <Tag color={exportStatusColor(selectedRequest.status)}>{exportStatusLabel(selectedRequest.status)}</Tag>
                  <Tag color={exportAvailabilityColor(selectedRequest)}>{exportAvailabilityText(selectedRequest)}</Tag>
                </Space>
              </div>
              <div className="research-export-detail-grid">
                <span>用途</span><strong>{selectedRequest.purpose}</strong>
                <span>样本量</span><strong>{selectedRequest.row_count}</strong>
                <span>过期时间</span><strong>{selectedRequest.expires_at || "-"}</strong>
                <span>下载状态</span><strong>{selectedRequest.downloaded_at ? "已下载" : "未下载"}</strong>
                {selectedRequest.downloaded_at ? (
                  <>
                    <span>下载时间</span><strong>{selectedRequest.downloaded_at}</strong>
                  </>
                ) : null}
                <span>审批意见</span><strong>{selectedRequest.approval_comment || "待审批"}</strong>
              </div>
              <div className="research-export-audit-lines" aria-label="导出申请审计摘要">
                <Typography.Text type="secondary">{`过期时间：${selectedRequest.expires_at || "-"}`}</Typography.Text>
                <Typography.Text type="secondary">{`下载状态：${selectedRequest.downloaded_at ? "已下载" : "未下载"}`}</Typography.Text>
                {selectedRequest.downloaded_at ? (
                  <Typography.Text type="secondary">{`下载时间：${selectedRequest.downloaded_at}`}</Typography.Text>
                ) : null}
                <Typography.Text type="secondary">{`审批意见：${selectedRequest.approval_comment || "待审批"}`}</Typography.Text>
              </div>
              {isAdminMode && selectedRequest.status === "PENDING" ? (
                <Space direction="vertical" size={8} className="research-export-approval-box">
                  <label htmlFor={`research-export-approval-${selectedRequest.id}`}>{`审批意见 #${selectedRequest.id}`}</label>
                  <Input
                    id={`research-export-approval-${selectedRequest.id}`}
                    value={approvalComments[selectedRequest.id] || ""}
                    onChange={(event) =>
                      setApprovalComments((current) => ({ ...current, [selectedRequest.id]: event.target.value }))
                    }
                    placeholder="填写审批意见"
                  />
                  <Space wrap>
                    <Button
                      type="primary"
                      aria-label={`批准 #${selectedRequest.id}`}
                      disabled={!approvalComments[selectedRequest.id]?.trim()}
                      onClick={() => approveRequest(selectedRequest)}
                    >
                      批准 #{selectedRequest.id}
                    </Button>
                    <Button
                      aria-label={`驳回 #${selectedRequest.id}`}
                      disabled={!approvalComments[selectedRequest.id]?.trim()}
                      onClick={() => rejectRequest(selectedRequest)}
                    >
                      驳回 #{selectedRequest.id}
                    </Button>
                  </Space>
                </Space>
              ) : null}
              {canDownloadExport(selectedRequest) ? (
                <Button aria-label={`下载 #${selectedRequest.id}`} onClick={() => downloadRequest(selectedRequest)}>
                  下载 #{selectedRequest.id}
                </Button>
              ) : null}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出申请" />
          )}
        </Card>
      </section>
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
    <AppShell role={isAdminMode ? "admin" : "research"} title={pageTitle}>
        <Space direction="vertical" size={16} className="onboarding-section">
          <PageHero
            eyebrow={isAdminMode ? "管理端科研审批" : "科研端脱敏分析"}
            title={isAdminMode ? "导出申请审批与留痕" : "脱敏样本、分型与干预效果总览"}
            summary={
              isAdminMode
                ? "仅展示审批所需的用途、格式、样本量、状态和过期时间。"
                : `当前脱敏样本 ${summary?.total_participants ?? 0} 例，仅展示 subject_id、年龄段与聚合指标。`
            }
            actions={
              <Link to={isAdminMode ? "/admin/dashboard" : "/research/export-jobs"}>
                <Button type="primary">{isAdminMode ? "返回运营驾驶舱" : "查看导出任务"}</Button>
              </Link>
            }
          />
          <ResearchPrivacyStrip isAdminMode={isAdminMode} summary={summary} requests={requests} visibleCount={visibleRequests.length} />
          {!isAdminMode ? (
            <Alert
              type="info"
              showIcon
              message="仅展示脱敏聚合数据"
              description="科研端隐藏姓名、手机、身份证等敏感字段，仅保留 subject_id、年龄段和群体统计。"
            />
          ) : null}
          {error ? <Alert type="error" showIcon message="加载科研数据失败，请确认科研权限。" /> : null}
          {notice ? <Alert type={noticeAlertType(notice)} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/">
              <Button>返回首页</Button>
            </Link>
            <Typography.Text type="secondary">
              {isAdminMode ? "管理员预览仅展示 subject_id、年龄段和脱敏指标。" : "科研端仅展示脱敏聚合指标和本人导出申请。"}
            </Typography.Text>
          </Space>
          {(mode === "dashboard" || mode === "export") && renderMetrics()}
          {!isAdminMode && (mode === "dashboard" || mode === "export") && renderResearchConsoleAnalytics()}
          {(mode === "dashboard" || mode === "export") && renderOverviewCharts()}
          {mode === "cluster" && renderClusterAnalysis()}
          {mode === "effects" && renderInterventionEffects()}
          {(mode === "jobs" || mode === "export" || isAdminMode) && renderExportJobs()}
          {isAdminMode && (mode === "dashboard" || mode === "export") && renderDesensitizedTable("管理员脱敏预览")}
        </Space>
    </AppShell>
  );
}
