import { Alert, Button, Descriptions, Drawer, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";
import { AppShell, ClinicalStatusBadge, DecisionBanner, StatusTile, WorkbenchSection } from "../../components/ProductUI";

function metadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}:${String(item)}`)
      .join("，");
  }
  return String(value ?? "-");
}

function MetadataList({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value ?? {});
  if (!entries.length) {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }
  return (
    <Space direction="vertical" size={4}>
      {entries.map(([key, item]) => (
        <Tag key={key} color="default">
          {key}：{metadataValue(item)}
        </Tag>
      ))}
    </Space>
  );
}

const auditActionLabels: Array<[RegExp, string]> = [
  [/USER_LOGIN/i, "用户登录"],
  [/FEEDBACK_ADJUST/i, "反馈调整处方"],
  [/APPROVE|APPROVED/i, "批准"],
  [/REJECT|REJECTED/i, "驳回"],
  [/REFER|REFERRED/i, "转介"],
  [/PAUSE/i, "暂停运动"],
  [/PUBLISH|PUBLISHED/i, "发布处方"],
  [/DOWNLOAD/i, "下载留痕"],
  [/EXPORT/i, "科研导出"],
  [/CREATE/i, "新建"],
  [/UPDATE/i, "更新"],
  [/GENERATE/i, "生成"],
  [/TEST/i, "规则测试"],
  [/REINDEX/i, "重建索引"],
  [/RULE/i, "风险规则"],
  [/TEMPLATE/i, "处方模板"],
  [/KNOWLEDGE/i, "知识库"]
];

function auditActionLabel(action: string) {
  const match = auditActionLabels.find(([pattern]) => pattern.test(action));
  if (match) return match[1];
  return action.replace(/_/g, " ").replace(/\b[A-Z]{3,}\b/g, (value) => value.toLowerCase());
}

function auditTone(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("REJECT") || upper.includes("REFER") || upper.includes("PAUSE") || upper.includes("RED")) return "red";
  if (upper.includes("APPROVE") || upper.includes("PUBLISH") || upper.includes("DOWNLOAD")) return "green";
  if (upper.includes("UPDATE") || upper.includes("CREATE") || upper.includes("GENERATE")) return "blue";
  if (upper.includes("TEST") || upper.includes("REINDEX")) return "gold";
  return "default";
}

function resourceLabel(value: string) {
  const labels: Record<string, string> = {
    PrescriptionRecord: "运动处方",
    RiskRuleConfig: "风险规则",
    ResearchExportRequest: "科研导出申请",
    User: "用户账号",
    ExpertProfile: "专家资料",
    Organization: "机构",
    KnowledgeDocument: "知识库资料",
    PrescriptionTemplate: "处方模板",
    ExerciseAction: "动作库"
  };
  return labels[value] ?? value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function metadataSearchText(value: Record<string, unknown>) {
  return Object.entries(value ?? {})
    .map(([key, item]) => `${key}:${metadataValue(item)}`)
    .join(" ");
}

function includesText(value: unknown, keyword: string) {
  return String(value ?? "").toLowerCase().includes(keyword.toLowerCase());
}

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [filters, setFilters] = useState({
    actor: "",
    action: "",
    resource: "",
    date: ""
  });

  useEffect(() => {
    listAuditLogs()
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const dateText = item.created_at.slice(0, 10);
      return (
        (!filters.actor || includesText(item.actor_id ?? "系统", filters.actor)) &&
        (!filters.action || includesText(item.action, filters.action)) &&
        (!filters.resource || includesText(`${item.resource_type} ${item.resource_id ?? ""} ${metadataSearchText(item.metadata)}`, filters.resource)) &&
        (!filters.date || dateText === filters.date)
      );
    });
  }, [filters, items]);

  const highRiskCount = items.filter((item) => auditTone(item.action) === "red").length;
  const exportCount = items.filter((item) => item.action.toUpperCase().includes("EXPORT") || item.resource_type.toUpperCase().includes("EXPORT")).length;

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: "动作",
      dataIndex: "action",
      key: "action",
      render: (value: string) => <Tag color={auditTone(value)}>{auditActionLabel(value)}</Tag>
    },
    {
      title: "资源",
      dataIndex: "resource_type",
      key: "resource_type",
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{resourceLabel(value)}</Typography.Text>
          <Typography.Text type="secondary">{record.resource_id || "无资源 ID"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "操作者",
      dataIndex: "actor_id",
      key: "actor_id",
      render: (value: number | null) => value ?? "系统"
    },
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at"
    }
  ];

  return (
    <AppShell
      role="admin"
      title="审计日志"
      subtitle="追踪规则、处方、资料、导出和身份治理操作"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={error ? "blocked" : "ready"} label={error ? "加载失败" : `留痕 ${total}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={error ? "danger" : "info"}
            title={error ? "审计日志加载失败" : "关键治理操作已集中留痕"}
            description="审计页用于追踪规则、处方审核、知识库、科研导出等关键动作。表格保留资源、操作者、元数据和时间。"
            meta={<ClinicalStatusBadge type="readiness" value={error ? "blocked" : "ready"} label={`共 ${total} 条`} />}
            actions={
              <Link to="/admin/dashboard">
                <Button>返回看板</Button>
              </Link>
            }
          />
          <div className="status-grid">
            <StatusTile label="留痕记录" value={total} detail={`当前筛选 ${filteredItems.length} 条`} tone={error ? "danger" : "safe"} />
            <StatusTile label="高风险操作" value={highRiskCount} detail="驳回、转介、暂停等" tone={highRiskCount ? "warning" : "safe"} />
            <StatusTile label="导出相关" value={exportCount} detail="审批、下载、脱敏导出" />
          </div>
          {error ? <Alert type="error" showIcon message="加载审计日志失败，请确认管理员权限。" /> : null}
          <WorkbenchSection title="快速过滤" description="基于当前返回记录快速过滤，适合排查最近治理动作。">
            <div className="audit-quick-filter-row" aria-label="高风险操作筛选">
              <Button onClick={() => setFilters((current) => ({ ...current, action: "RULE", resource: "RiskRule" }))}>
                规则变更
              </Button>
              <Button onClick={() => setFilters((current) => ({ ...current, action: "PUBLISH", resource: "Prescription" }))}>
                处方发布
              </Button>
              <Button onClick={() => setFilters((current) => ({ ...current, action: "EXPORT", resource: "Export" }))}>
                导出审批
              </Button>
              <Button onClick={() => setFilters((current) => ({ ...current, action: "USER", resource: "User" }))}>
                权限变更
              </Button>
            </div>
            <div className="audit-filter-grid">
              <label>
                操作者
                <Input
                  aria-label="按操作者过滤"
                  value={filters.actor}
                  onChange={(event) => setFilters((current) => ({ ...current, actor: event.target.value }))}
                  placeholder="用户 ID 或 系统"
                  allowClear
                />
              </label>
              <label>
                动作
                <Input
                  aria-label="按动作过滤"
                  value={filters.action}
                  onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
                  placeholder="批准 / 导出 / 规则"
                  allowClear
                />
              </label>
              <label>
                资源或元数据
                <Input
                  aria-label="按资源过滤"
                  value={filters.resource}
                  onChange={(event) => setFilters((current) => ({ ...current, resource: event.target.value }))}
                  placeholder="处方 / 风险等级 / 导出申请"
                  allowClear
                />
              </label>
              <label>
                日期
                <Input
                  aria-label="按日期过滤"
                  type="date"
                  value={filters.date}
                  onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
              <Button
                onClick={() => setFilters({ actor: "", action: "", resource: "", date: "" })}
              >
                清空过滤
              </Button>
            </div>
          </WorkbenchSection>
          <WorkbenchSection title="审计明细" description="点击行或详情按钮查看完整 metadata。">
            <Table
              className="compact-governance-table"
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={filteredItems}
              pagination={{ pageSize: 12, showSizeChanger: true }}
              scroll={{ x: 760 }}
              locale={{ emptyText: "暂无审计记录" }}
              onRow={(record) => ({
                onClick: () => setSelectedLog(record)
              })}
            />
          </WorkbenchSection>
          <Drawer
            title={selectedLog ? `审计详情 #${selectedLog.id}` : "审计详情"}
            width={640}
            open={Boolean(selectedLog)}
            onClose={() => setSelectedLog(null)}
            destroyOnClose
          >
            {selectedLog ? (
              <Space direction="vertical" size={16} className="onboarding-section">
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="动作">
                    <Tag color={auditTone(selectedLog.action)}>{auditActionLabel(selectedLog.action)}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="资源">{resourceLabel(selectedLog.resource_type)}</Descriptions.Item>
                  <Descriptions.Item label="资源 ID">{selectedLog.resource_id || "-"}</Descriptions.Item>
                  <Descriptions.Item label="操作者">{selectedLog.actor_id ?? "系统"}</Descriptions.Item>
                  <Descriptions.Item label="时间">{selectedLog.created_at}</Descriptions.Item>
                </Descriptions>
                <div className="metadata-detail-panel">
                  <Typography.Text strong>审计元数据与变更差异</Typography.Text>
                  <MetadataList value={selectedLog.metadata} />
                </div>
              </Space>
            ) : null}
          </Drawer>
        </Space>
    </AppShell>
  );
}
