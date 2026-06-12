import { Alert, Card, Col, Descriptions, List, Row, Space, Tabs, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ClipboardCheck, FileText, ListChecks, ShieldAlert, ShieldCheck } from "lucide-react";

import { getAdminDashboardSummary, type AdminDashboardSummary } from "../../api/adminDashboard";
import { AppShell, ChartCard, ClinicalStatusBadge, ClinicalSummaryStrip, DecisionBanner, formatStatusLabel, MetricCard, StatusTile, WorkbenchSection } from "../../components/ProductUI";
import {
  ExpertQueueChart,
  PrescriptionTrendChart,
  RiskDistributionChart,
  RuleHitRankChart
} from "../../components/charts";

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function namedValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([name, value]) => ({ name, value }));
}

function queueValues(data: Record<string, number> = {}) {
  return Object.entries(data).map(([status, count]) => ({ status: formatStatusLabel(status, "review"), count }));
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
              <Tag color="blue">{`规则 ${summary?.reference_data_status?.risk_rules.active ?? 0} / ${summary?.reference_data_status?.risk_rules.total ?? 0}`}</Tag>
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
  const failedDocuments = status?.rag_failed_documents_count ?? status?.knowledge.failed_documents ?? 0;
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
          <Descriptions.Item label="RAG 索引失败文档">{failedDocuments}</Descriptions.Item>
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
  const issues = readinessIssues(summary?.reference_data_status);
  const criticalEntries = [
    {
      title: "处理科研导出审批",
      detail: "先处理待审批导出，避免脱敏数据流转无留痕。",
      href: "/admin/research-export",
      tone: "info"
    },
    {
      title: "查看风险规则",
      detail: "红色规则和专家草稿影响训练入口。",
      href: "/admin/rules",
      tone: "warning"
    },
    {
      title: "治理模板与知识库",
      detail: "动作、模板、RAG 索引决定处方来源。",
      href: "/admin/templates",
      tone: "safe"
    },
    {
      title: "查看审计日志",
      detail: "配置、发布、导出和账号动作均需可追踪。",
      href: "/admin/audit-logs",
      tone: "neutral"
    }
  ];

  return (
    <AppShell
      role="admin"
      title="运营指挥台"
      subtitle="先看上线阻断，再处理审核积压、R3 转介和资料治理"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={readinessIssues(summary?.reference_data_status).length ? "blocked" : "ready"} label={readinessIssues(summary?.reference_data_status).length ? "存在阻断" : "上线闸口正常"} />
          <ClinicalStatusBadge type="review" value="pending_review" label={`R2 ${summary?.reference_data_status ? asPercent(summary.r2_review_rate) : "0%"}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={readinessIssues(summary?.reference_data_status).length ? "warning" : "safe"}
            title={readinessIssues(summary?.reference_data_status).length ? "存在上线阻断或资料缺口" : "运营闸口正常"}
            description={`当前累计 ${summary?.total_users ?? 0} 名用户，处方生成 ${prescriptionGenerated} 份，R3 转介 ${summary?.r3_referral_count ?? 0} 例。先处理 readiness、R2 积压、R3 转介和资料索引。`}
            meta={
              <>
                <ClinicalStatusBadge type="readiness" value={readinessIssues(summary?.reference_data_status).length ? "blocked" : "ready"} label={`${readinessIssues(summary?.reference_data_status).length} 项阻断`} />
                <ClinicalStatusBadge type="readiness" value={ragIndexedChunks === ragChunks && ragChunks > 0 ? "ready" : "degraded"} label={`RAG ${ragIndexedChunks}/${ragChunks}`} />
              </>
            }
          />
          {error ? <Alert type="error" showIcon message="加载管理统计失败，请确认管理员权限。" /> : null}
          <WorkbenchSection title="上线闸口与待办异常" description="首屏只保留阻断、异常和处理入口，趋势图表进入下方分析区。">
            <div className="admin-gate-grid">
              <div className="admin-gate-issues">
                {issues.length ? (
                  <Alert
                    type="error"
                    showIcon
                    message="当前存在上线阻断"
                    description={
                      <List
                        size="small"
                        dataSource={issues}
                        renderItem={(item) => <List.Item>{item}</List.Item>}
                      />
                    }
                  />
                ) : (
                  <Alert type="success" showIcon message="上线闸口正常" description="运行依赖、资料索引和安全链路未发现阻断项。" />
                )}
                <ClinicalSummaryStrip className="admin-critical-strip" data-testid="admin-kpi-strip">
                  <StatusTile label="上线阻断" value={issues.length} detail="LLM / Embedding / OCR / RAG" tone={issues.length ? "danger" : "safe"} icon={<ShieldCheck />} />
                  <StatusTile label="R2 审核积压" value={summary ? asPercent(summary.r2_review_rate) : "0%"} detail="强制专家审核链路" tone="warning" icon={<ClipboardCheck />} />
                  <StatusTile label="R3 转介" value={summary?.r3_referral_count ?? 0} detail="不生成训练处方" tone={(summary?.r3_referral_count ?? 0) ? "danger" : "neutral"} icon={<ShieldAlert />} />
                </ClinicalSummaryStrip>
              </div>
              <nav className="admin-gate-actions" aria-label="关键处理入口">
                {criticalEntries.map((item) => (
                  <Link className={`admin-gate-action admin-gate-${item.tone}`} to={item.href} key={item.href}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </WorkbenchSection>
          <WorkbenchSection title="运营摘要" description="摘要用于理解规模和资料状态，不替代上线闸口判断。">
            <AdminCommandCenter summary={summary} />
          </WorkbenchSection>
          <WorkbenchSection title="运营分析" description="分析图表分组在标签页内，避免首屏图表墙；每次只看一组。">
            <Tabs
              className="admin-analysis-tabs"
              defaultActiveKey="safety"
              items={[
                {
                  key: "safety",
                  label: "安全与审核",
                  children: (
                    <Row gutter={[16, 16]} className="admin-dashboard-chart-grid">
                      <Col xs={24} lg={12}>
                        <ChartCard
                          title="风险分布"
                          unit="人"
                          insight="用于判断 R2/R3 是否形成运营阻断，优先安排审核或转介资源。"
                          threshold="R3 增加时先检查转介和告知链路。"
                        >
                          <RiskDistributionChart data={namedValues(summary?.risk_distribution)} loading={!summary && !error} />
                        </ChartCard>
                      </Col>
                      <Col xs={24} lg={12}>
                        <ChartCard
                          title="专家审核队列"
                          unit="项"
                          insight="用于判断审核积压结构，而不是替代专家处理顺序。"
                          threshold="超时或 R2 积压增加时优先处理队列治理。"
                        >
                          <ExpertQueueChart data={queueValues(summary?.review_stats)} loading={!summary && !error} />
                        </ChartCard>
                      </Col>
                      <Col xs={24}>
                        <ChartCard
                          title="规则命中排行"
                          unit="次"
                          insight="用于定位高频风险规则，决定是否需要复核规则阈值或文案。"
                          threshold="异常高频命中需排查数据质量和规则配置。"
                        >
                          <RuleHitRankChart data={summary?.rule_hit_rank ?? []} loading={!summary && !error} />
                        </ChartCard>
                      </Col>
                    </Row>
                  )
                },
                {
                  key: "flow",
                  label: "业务流转",
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col xs={24} lg={16}>
                        <ChartCard
                          title="处方生成/发布趋势"
                          unit="张"
                          insight="用于观察生成、发布之间是否存在审核或安全阻断。"
                          threshold="生成高于发布时优先看 R2 审核和 R3 转介。"
                        >
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
                        <MetricCard title="处方发布" value={prescriptionPublished} icon={<FileText />} trend="flat" trendLabel="已发布状态" />
                      </Col>
                    </Row>
                  )
                },
                {
                  key: "model",
                  label: "资料与模型",
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col xs={24} lg={12}>
                        <div className="admin-model-summary">
                          <Typography.Text strong>模板使用摘要</Typography.Text>
                          <Typography.Paragraph type="secondary">
                            模板排名作为治理入口，不在驾驶舱继续增加图表。使用量异常集中时进入模板库复核适用范围。
                          </Typography.Paragraph>
                          <List
                            size="small"
                            dataSource={(summary?.template_usage_rank ?? []).slice(0, 5)}
                            locale={{ emptyText: "暂无模板使用数据" }}
                            renderItem={(item) => (
                              <List.Item>
                                <Space wrap>
                                  <Tag>{item.template}</Tag>
                                  <Typography.Text>{`${item.count} 次`}</Typography.Text>
                                </Space>
                              </List.Item>
                            )}
                          />
                          <Link to="/admin/templates" className="inline-workbench-link">
                            进入模板库治理
                          </Link>
                        </div>
                      </Col>
                      <Col xs={24} lg={12}>
                        <div className="admin-model-summary">
                          <Typography.Text strong>分型模型摘要</Typography.Text>
                          <Typography.Paragraph type="secondary">
                            分型分布用于模型治理，不放在驾驶舱首屏形成图表墙；进入聚类模型页查看训练、启用和版本详情。
                          </Typography.Paragraph>
                          <List
                            size="small"
                            dataSource={clusterScatterValues(summary?.cluster_distribution).slice(0, 5)}
                            locale={{ emptyText: "暂无分型分布数据" }}
                            renderItem={(item) => (
                              <List.Item>
                                <Space wrap>
                                  <Tag>{item.cluster}</Tag>
                                  <Typography.Text>{`${item.y} 样本`}</Typography.Text>
                                </Space>
                              </List.Item>
                            )}
                          />
                          <Link to="/admin/clustering" className="inline-workbench-link">
                            进入聚类模型生命周期
                          </Link>
                        </div>
                      </Col>
                    </Row>
                  )
                },
                {
                  key: "reference",
                  label: "上线资料状态",
                  children: <ReferenceDataStatus summary={summary} />
                }
              ]}
            />
          </WorkbenchSection>
        </Space>
    </AppShell>
  );
}
