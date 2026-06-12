import { Alert, Button, Card, Col, Input, List, Row, Space, Tag, Typography } from "antd";
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

function trendValues(items: Array<{ date: string; value?: number; rpe?: number; pain?: number; completionRate?: number }> = []) {
  return items;
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

  async function submitRequest() {
    setNotice(null);
    try {
      const item = await createResearchExportRequest({ format, purpose });
      setRequests((current) => [item, ...current]);
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
    return (
      <Card title={title}>
        {loading ? (
          <Typography.Text>加载中</Typography.Text>
        ) : rows.length ? (
          <div className="simple-table-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>研究对象ID</th>
                  <th>匿名编码</th>
                  <th>年龄</th>
                  <th>性别</th>
                  <th>BMI</th>
                  <th>风险等级</th>
                  <th>分型</th>
                  <th>处方状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => {
                  const level = record.risk_screening?.risk_level as string | undefined;
                  return (
                    <tr key={record.participant_code}>
                      <td>{record.research_subject_id || "-"}</td>
                      <td>{record.participant_code}</td>
                      <td>{String(record.profile.age ?? "-")}</td>
                      <td>{String(record.profile.sex ?? "-")}</td>
                      <td>{String(record.profile.bmi ?? "-")}</td>
                      <td>{level ? <Tag color={level === "R3" ? "red" : level === "R2" ? "orange" : "blue"}>{level}</Tag> : "-"}</td>
                      <td>{(record.latest_prescription?.cluster_label as string | undefined) || "-"}</td>
                      <td>{(record.latest_prescription?.status as string | undefined) || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Typography.Text type="secondary">暂无脱敏数据</Typography.Text>
        )}
      </Card>
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
              <FeedbackTrendChart data={completionTrend} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="RPE趋势">
              <FeedbackTrendChart data={rpeTrend} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="疼痛趋势">
              <FeedbackTrendChart data={painTrend} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="血压变化趋势">
              <BloodPressureTrendChart data={effects?.blood_pressure_trend ?? []} loading={loading} />
            </ChartCard>
          </Col>
          <Col xs={24} md={12}>
            <ChartCard title="血糖变化趋势">
              <BloodGlucoseTrendChart data={effects?.blood_glucose_trend ?? []} loading={loading} />
            </ChartCard>
          </Col>
        </Row>
      </>
    );
  }

  function renderExportJobs() {
    return (
      <Card title="导出申请" className="dashboard-panel">
        <Space direction="vertical" size={12} className="onboarding-section">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <label htmlFor="research-export-purpose">导出用途</label>
              <Input
                id="research-export-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="填写研究用途或课题名称"
              />
            </Col>
            <Col xs={24} md={6}>
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
            </Col>
            <Col xs={24} md={6}>
              <Typography.Text type="secondary">下载策略</Typography.Text>
              <Typography.Paragraph>审批通过后限时下载</Typography.Paragraph>
            </Col>
          </Row>
          <Button type="primary" onClick={submitRequest}>
            提交导出申请
          </Button>
          {!isAdminMode && hiddenRequestCount > 0 ? (
            <Typography.Text type="secondary">非本人申请不可见</Typography.Text>
          ) : null}
          <List
            bordered
            dataSource={visibleRequests}
            locale={{ emptyText: "暂无导出申请" }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  isAdminMode && item.status === "PENDING" ? (
                    <Button
                      key="approve"
                      type="primary"
                      aria-label={`批准 #${item.id}`}
                      disabled={!approvalComments[item.id]?.trim()}
                      onClick={() => approveRequest(item)}
                    >
                      批准 #{item.id}
                    </Button>
                  ) : null,
                  isAdminMode && item.status === "PENDING" ? (
                    <Button
                      key="reject"
                      aria-label={`驳回 #${item.id}`}
                      disabled={!approvalComments[item.id]?.trim()}
                      onClick={() => rejectRequest(item)}
                    >
                      驳回 #{item.id}
                    </Button>
                  ) : null,
                  canDownloadExport(item) ? (
                    <Button key="download" aria-label={`下载 #${item.id}`} onClick={() => downloadRequest(item)}>
                      下载 #{item.id}
                    </Button>
                  ) : null
                ].filter(Boolean)}
              >
                <Space direction="vertical" size={4}>
                  <Space wrap>
                    <Typography.Text strong>{`#${item.id} ${item.format.toUpperCase()}`}</Typography.Text>
                    <Typography.Text>{item.purpose}</Typography.Text>
                  </Space>
                  <Space wrap>
                    <Tag>{item.status}</Tag>
                    <Tag color={exportAvailabilityColor(item)}>{exportAvailabilityText(item)}</Tag>
                    <Typography.Text type="secondary">{`样本 ${item.row_count}`}</Typography.Text>
                    <Typography.Text type="secondary">{`过期时间：${item.expires_at || "-"}`}</Typography.Text>
                    <Typography.Text type="secondary">{`下载状态：${item.downloaded_at ? "已下载" : "未下载"}`}</Typography.Text>
                    {item.downloaded_at ? (
                      <Typography.Text type="secondary">{`下载时间：${item.downloaded_at}`}</Typography.Text>
                    ) : null}
                    <Typography.Text type="secondary">{`审批意见：${item.approval_comment || "待审批"}`}</Typography.Text>
                  </Space>
                  {isAdminMode && item.status === "PENDING" ? (
                    <Space direction="vertical" size={4}>
                      <label htmlFor={`research-export-approval-${item.id}`}>{`审批意见 #${item.id}`}</label>
                      <Input
                        id={`research-export-approval-${item.id}`}
                        value={approvalComments[item.id] || ""}
                        onChange={(event) =>
                          setApprovalComments((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="填写审批意见"
                      />
                    </Space>
                  ) : null}
                </Space>
              </List.Item>
            )}
          />
        </Space>
      </Card>
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
                : `当前脱敏样本 ${summary?.total_participants ?? 0} 例，仅使用 research_subject_id / participant_code。`
            }
            actions={
              <Link to={isAdminMode ? "/admin/dashboard" : "/research/export-jobs"}>
                <Button type="primary">{isAdminMode ? "返回运营驾驶舱" : "查看导出任务"}</Button>
              </Link>
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
          {(mode === "dashboard" || mode === "export") && renderMetrics()}
          {(mode === "dashboard" || mode === "export") && renderOverviewCharts()}
          {mode === "cluster" && renderClusterAnalysis()}
          {mode === "effects" && renderInterventionEffects()}
          {(mode === "jobs" || mode === "export" || isAdminMode) && renderExportJobs()}
          {isAdminMode && (mode === "dashboard" || mode === "export") && renderDesensitizedTable("管理员脱敏预览")}
        </Space>
    </AppShell>
  );
}
