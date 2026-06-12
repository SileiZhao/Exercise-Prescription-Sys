import { Alert, Button, Card, Col, Descriptions, List, Row, Space } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, FileText, ShieldAlert, Users } from "lucide-react";

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
  const expertReviewCount = sumValues(summary?.review_stats);
  const r2AverageReviewHours = Number((summary?.review_stats as Record<string, number> | undefined)?.average_review_hours ?? 0);

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
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <MetricCard title="用户总数" value={summary?.total_users ?? 0} icon={<Users />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="R2审核率" value={summary ? asPercent(summary.r2_review_rate) : "0%"} icon={<ClipboardCheck />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="处方生成数" value={prescriptionGenerated} icon={<FileText />} trend="up" trendLabel="按数据库处方记录统计" />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="处方发布数" value={prescriptionPublished} icon={<FileText />} trend="flat" trendLabel="PUBLISHED 状态" />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="专家审核数" value={expertReviewCount} icon={<ClipboardCheck />} trend="flat" trendLabel="审核队列状态汇总" />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="R2平均审核时长" value={r2AverageReviewHours} suffix="小时" icon={<ClipboardCheck />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="R3转介量" value={summary?.r3_referral_count ?? 0} icon={<ShieldAlert />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="打卡完成率" value={summary?.feedback_stats.average_completion_rate ?? 0} suffix="%" icon={<ClipboardCheck />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="处方数量" value={Object.values(summary?.prescription_status ?? {}).reduce((a, b) => a + b, 0)} icon={<FileText />} />
            </Col>
            <Col xs={24} md={8}>
              <MetricCard title="已审核模板" value={summary?.template_usage.approved_templates ?? 0} icon={<FileText />} />
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <ChartCard title="风险分布">
                <RiskDistributionChart data={namedValues(summary?.risk_distribution)} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
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
            <Col xs={24} md={12}>
              <ChartCard title="专家审核队列">
                <ExpertQueueChart data={queueValues(summary?.review_stats)} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <ChartCard title="分型分布">
                <ClusterScatterChart data={clusterScatterValues(summary?.cluster_distribution)} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <ChartCard title="规则命中排行">
                <RuleHitRankChart data={summary?.rule_hit_rank ?? []} loading={!summary && !error} />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <ChartCard title="模板使用量">
                <TemplateUsageChart data={summary?.template_usage_rank ?? []} loading={!summary && !error} />
              </ChartCard>
            </Col>
          </Row>
          <ReferenceDataStatus summary={summary} />
        </Space>
    </AppShell>
  );
}
