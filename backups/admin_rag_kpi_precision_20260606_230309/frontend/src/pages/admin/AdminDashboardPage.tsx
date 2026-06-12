import { Alert, Button, Card, Col, Descriptions, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ClipboardCheck, Database, FileText, ListChecks, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { getAdminDashboardSummary, type AdminDashboardSummary } from "../../api/adminDashboard";
import { AppShell, ChartCard, MetricCard, PageHero } from "../../components/ProductUI";
import {
  ClusterScatterChart,
  ExpertQueueChart,
  PrescriptionTrendChart,
  RiskDistributionChart,
  RuleHitRankChart,
  TemplateUsageChart
} from "../../components/charts";

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function ratioPercent(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return "0%";
  return asPercent(numerator / denominator);
}

function namedValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([name, value]) => ({ name, value }));
}

function queueValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([status, count]) => ({ status, count }));
}

function clusterScatterValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([cluster, count], index) => ({
    x: index + 1,
    y: count,
    cluster,
    label: `${cluster} ${count}`
  }));
}

function sumValues(data: Record<string, number> = {}) {
  return Object.values(data).reduce((total, value) => total + value, 0);
}

function readinessIssues(status: AdminDashboardSummary["reference_data_status"] | undefined) {
  if (!status) {
    return ["上线资料状态未加载"];
  }
  const issues: string[] = [];
  const skippedDocuments = status.rag_skipped_documents_count ?? status.knowledge.skipped_documents ?? 0;
  const chunks = status.knowledge.chunks ?? 0;
  const indexedChunks = status.knowledge.indexed_chunks ?? 0;

  if (!status.llm.production_ready) {
    issues.push("LLM 未达到生产可用状态");
  }
  if (status.embedding.production_ready === false) {
    issues.push("Embedding 未达到生产可用状态");
  }
  if (!status.ocr.enabled) {
    issues.push("OCR 未启用，资料入库链路不可用");
  }
  if (skippedDocuments > 0) {
    issues.push(`RAG 存在 ${skippedDocuments} 份跳过文档`);
  }
  if (chunks > 0 && indexedChunks < chunks) {
    issues.push(`RAG 索引未完成：${indexedChunks} / ${chunks} 切片`);
  }
  return issues;
}

function AdminCommandCenter({ summary }: { summary: AdminDashboardSummary | null }) {
  const prescriptionGenerated = sumValues(summary?.prescription_status);
  const prescriptionPublished = summary?.prescription_status?.PUBLISHED ?? 0;
  const ragChunks = summary?.reference_data_status?.knowledge.chunks ?? 0;
  const ragIndexedChunks = summary?.reference_data_status?.knowledge.indexed_chunks ?? 0;
  const actionApproved = summary?.reference_data_status?.actions.approved ?? 0;
  const actionPending = summary?.reference_data_status?.actions.pending_review ?? 0;
  const templateApproved = summary?.reference_data_status?.templates.approved ?? 0;
  const templateTotal = summary?.reference_data_status?.templates.total ?? 0;
  const llmProvider = summary?.reference_data_status?.llm.provider ?? "-";
  const embeddingProvider = summary?.reference_data_status?.embedding.provider ?? "-";
  const readinessIssueCount = readinessIssues(summary?.reference_data_status).length;

  return (
    <section className="admin-command-center" data-testid="admin-command-center">
      <div className="admin-command-center-head">
        <span className="admin-command-center-title">
          <BarChart3 size={18} />
          运营指挥摘要
        </span>
        <Tag color={readinessIssueCount ? "red" : "green"}>{readinessIssueCount ? `${readinessIssueCount} 项上线阻断` : "上线闸口正常"}</Tag>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="admin-command-card">
            <div className="admin-command-card-title">
              <FileText size={16} />
              <Typography.Text strong>试点处方流转</Typography.Text>
            </div>
            <strong className="admin-command-primary">{`发布 ${prescriptionPublished} / 生成 ${prescriptionGenerated}`}</strong>
            <Space wrap size={[6, 6]}>
              <Tag color="blue">{`R2 审核 ${summary ? asPercent(summary.r2_review_rate) : "0%"}`}</Tag>
              <Tag color="red">{`R3 转介 ${summary?.r3_referral_count ?? 0}`}</Tag>
              <Tag color="green">{`打卡 ${summary?.feedback_stats.average_completion_rate ?? 0}%`}</Tag>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="admin-command-card">
            <div className="admin-command-card-title">
              <ShieldCheck size={16} />
              <Typography.Text strong>安全上线闸口</Typography.Text>
            </div>
            <strong className="admin-command-primary">{`LLM ${llmProvider}`}</strong>
            <Space wrap size={[6, 6]}>
              <Tag color="cyan">{`Embedding ${embeddingProvider}`}</Tag>
              <Tag color={ragIndexedChunks === ragChunks && ragChunks > 0 ? "green" : "gold"}>{`RAG ${ragIndexedChunks} / ${ragChunks}`}</Tag>
              <Tag color={summary?.reference_data_status?.ocr.enabled ? "green" : "red"}>{summary?.reference_data_status?.ocr.enabled ? "OCR 已启用" : "OCR 未启用"}</Tag>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="admin-command-card">
            <div className="admin-command-card-title">
              <ListChecks size={16} />
              <Typography.Text strong>模型与资料状态</Typography.Text>
            </div>
            <strong className="admin-command-primary">{`动作 ${actionApproved} 已审核 / ${actionPending} 待审核`}</strong>
            <Space wrap size={[6, 6]}>
              <Tag color="blue">{`模板 ${templateApproved} / ${templateTotal}`}</Tag>
              <Tag color="purple">{`规则 ${summary?.reference_data_status?.risk_rules.active ?? 0} / ${summary?.reference_data_status?.risk_rules.total ?? 0}`}</Tag>
              <Tag>{`合规 ${summary?.reference_data_status?.compliance.confirmed ?? 0} 已确认`}</Tag>
            </Space>
          </Card>
        </Col>
      </Row>
    </section>
  );
}

function ReferenceDataStatus({ summary }: { summary: AdminDashboardSummary | null }) {
  const status = summary?.reference_data_status;
  const issues = readinessIssues(status);
  const llmLabel = status
    ? `${status.llm.provider}${status.llm.model ? ` / ${status.llm.model}` : ""}，${status.llm.production_ready ? "生产可用" : "生产不可用"}`
    : "-";
  const embeddingLabel = status
    ? `${status.embedding.provider}${status.embedding.model ? ` / ${status.embedding.model}` : ""}`
    : "-";
  const ocrLabel = status ? `${status.ocr.provider}，${status.ocr.enabled ? "已启用" : "未启用"}` : "-";
  const confirmedCompliance = status?.compliance?.confirmed ?? status?.confirmed_compliance_count ?? 0;
  const draftCompliance = status?.compliance?.draft ?? status?.draft_compliance_count ?? 0;
  return (
    <Card title="上线资料状态" className="dashboard-panel">
      <Space direction="vertical" size={12} className="onboarding-section">
        {issues.length ? (
          <Alert
            type="error"
            showIcon
            message="上线阻断"
            description={
              <List
                size="small"
                dataSource={issues}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            }
          />
        ) : (
          <Alert type="success" showIcon message="上线就绪" description="LLM、Embedding、OCR 与 RAG 索引均满足上线检查。" />
        )}
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="规则库">
            {status ? `${status.risk_rules.active} / ${status.risk_rules.total}` : "0 / 0"}
          </Descriptions.Item>
          <Descriptions.Item label="动作库">
            {status ? `${status.actions.approved} 已审核 / ${status.actions.pending_review} 待审核` : "0 已审核 / 0 待审核"}
          </Descriptions.Item>
          <Descriptions.Item label="已批准动作">{status?.approved_actions_count ?? 0}</Descriptions.Item>
          <Descriptions.Item label="合规材料">
            {status ? `${confirmedCompliance} 已确认 / ${draftCompliance} 未确认` : "0 已确认 / 0 未确认"}
          </Descriptions.Item>
          <Descriptions.Item label="模板库">
            {status ? `${status.templates.approved} / ${status.templates.total}` : "0 / 0"}
          </Descriptions.Item>
          <Descriptions.Item label="RAG">
            {status
              ? `${status.knowledge.documents} 文档 / ${status.knowledge.chunks} 切片 / ${status.knowledge.indexed_chunks} 已索引`
              : "0 文档 / 0 切片 / 0 已索引"}
          </Descriptions.Item>
          <Descriptions.Item label="RAG 跳过文档">{status?.rag_skipped_documents_count ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Embedding">{embeddingLabel}</Descriptions.Item>
          <Descriptions.Item label="OCR">{ocrLabel}</Descriptions.Item>
          <Descriptions.Item label="LLM">{llmLabel}</Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  );
}

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getAdminDashboardSummary()
      .then((data) => {
        setSummary(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  const prescriptionGenerated = sumValues(summary?.prescription_status);
  const prescriptionPublished = summary?.prescription_status?.PUBLISHED ?? 0;
  const ragChunks = summary?.reference_data_status?.knowledge.chunks ?? 0;
  const ragIndexedChunks = summary?.reference_data_status?.knowledge.indexed_chunks ?? 0;
  const ragIndexRate = ratioPercent(ragIndexedChunks, ragChunks);

  return (
    <AppShell role="admin" title="管理看板">
        <Space direction="vertical" size={16} className="onboarding-section">
          <PageHero
            eyebrow="管理端运营驾驶舱"
            title="试点运营、规则与模型状态总览"
            summary={`当前累计 ${summary?.total_users ?? 0} 名用户，处方生成 ${prescriptionGenerated} 份，R3 转介 ${summary?.r3_referral_count ?? 0} 例。`}
            actions={
              <Link to="/admin/research-export">
                <Button type="primary">审批科研导出</Button>
              </Link>
            }
          />
          {error ? <Alert type="error" showIcon message="加载管理统计失败，请确认管理员权限。" /> : null}
          <Space wrap>
            <Link to="/admin/users">
              <Button type="primary">用户与专家</Button>
            </Link>
            <Link to="/admin/templates">
              <Button>模板与知识库</Button>
            </Link>
            <Link to="/admin/rules">
              <Button>风险规则</Button>
            </Link>
            <Link to="/admin/clusters">
              <Button>聚类模型</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>审计日志</Button>
            </Link>
            <Link to="/">
              <Button>返回首页</Button>
            </Link>
          </Space>
          <Row gutter={[12, 12]} data-testid="admin-kpi-strip">
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="总用户" value={summary?.total_users ?? 0} icon={<Users />} />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="R2审核率" value={summary ? asPercent(summary.r2_review_rate) : "0%"} icon={<ClipboardCheck />} />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="处方发布" value={prescriptionPublished} icon={<FileText />} trend="flat" trendLabel="PUBLISHED 状态" />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="R3转介" value={summary?.r3_referral_count ?? 0} icon={<ShieldAlert />} />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="打卡完成率" value={summary?.feedback_stats.average_completion_rate ?? 0} suffix="%" icon={<ClipboardCheck />} />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <MetricCard title="RAG索引率" value={ragIndexRate} icon={<Database />} trendLabel={`${ragIndexedChunks} / ${ragChunks} 切片`} />
            </Col>
          </Row>
          <AdminCommandCenter summary={summary} />
          <Row gutter={[16, 16]} className="admin-dashboard-chart-grid">
            <Col xs={24} lg={16}>
              <ChartCard title="处方生成/发布趋势">
                <PrescriptionTrendChart
                  data={(summary?.prescription_trend ?? []).map((item) => ({
                    date: item.date,
                    generated: item.generated,
                    approved: item.published
                  }))}
                  loading={!summary && !error}
                />
              </ChartCard>
            </Col>
            <Col xs={24} lg={8}>
              <ChartCard title="风险分布">
                <RiskDistributionChart data={namedValues(summary?.risk_distribution)} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="专家审核队列">
                <ExpertQueueChart data={queueValues(summary?.review_stats)} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="规则命中排行">
                <RuleHitRankChart data={summary?.rule_hit_rank ?? []} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="模板使用量">
                <TemplateUsageChart data={summary?.template_usage_rank ?? []} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title="分型分布">
                <ClusterScatterChart data={clusterScatterValues(summary?.cluster_distribution)} loading={!summary && !error} />
              </ChartCard>
            </Col>
          </Row>
          <ReferenceDataStatus summary={summary} />
        </Space>
    </AppShell>
  );
}
