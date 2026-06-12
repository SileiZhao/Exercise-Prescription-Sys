import { Alert, Button, Card, Descriptions, Drawer, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";
import { AppShell } from "../../components/ProductUI";

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function actionColor(action: string) {
  if (/REJECT|BLOCK|FAIL|ERROR|DELETE|ARCHIVE/i.test(action)) {
    return "red";
  }
  if (/REVIEW|APPROVE|CONFIRM/i.test(action)) {
    return "gold";
  }
  if (/GENERATE|CREATE|UPLOAD|EXPORT/i.test(action)) {
    return "blue";
  }
  return "default";
}

function metadataSummary(value: Record<string, unknown>) {
  const entries = Object.entries(value ?? {});
  if (!entries.length) {
    return "-";
  }
  const first = entries.slice(0, 2).map(([key, item]) => `${key}：${metadataValue(item)}`);
  return entries.length > 2 ? `${first.join("，")}，另 ${entries.length - 2} 项` : first.join("，");
}

function metadataBrief(value: Record<string, unknown>) {
  const entries = Object.entries(value ?? {});
  if (!entries.length) {
    return "-";
  }
  const keys = entries.slice(0, 3).map(([key]) => key).join("、");
  return entries.length > 3 ? `元数据 ${entries.length} 项：${keys} 等` : `元数据 ${entries.length} 项：${keys}`;
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

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

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

  const actionOptions = Array.from(new Set(items.map((item) => item.action))).map((value) => ({ value, label: value }));
  const resourceOptions = Array.from(new Set(items.map((item) => item.resource_type))).map((value) => ({ value, label: value }));
  const filteredItems = items.filter((item) => {
    const text = [
      item.action,
      item.resource_type,
      item.resource_id,
      item.actor_id,
      item.created_at,
      metadataSummary(item.metadata)
    ].join(" ");
    const matchesQuery = text.toLowerCase().includes(query.toLowerCase());
    const matchesAction = actionFilter === "all" || item.action === actionFilter;
    const matchesResource = resourceFilter === "all" || item.resource_type === resourceFilter;
    return matchesQuery && matchesAction && matchesResource;
  });
  const actorCount = new Set(items.map((item) => item.actor_id ?? "system")).size;
  const prescriptionEvents = items.filter((item) => /Prescription/i.test(item.resource_type)).length;
  const safetyEvents = items.filter((item) => /REVIEW|RISK|REJECT|BLOCK|ADJUST/i.test(`${item.action} ${metadataSummary(item.metadata)}`)).length;
  const displayTotal = total || items.length;
  const latestLog = items[0];
  const columns: ColumnsType<AuditLogItem> = [
    {
      title: "动作",
      dataIndex: "action",
      key: "action",
      width: 240,
      render: (value: string) => <Tag color={actionColor(value)}>{value}</Tag>
    },
    {
      title: "资源",
      dataIndex: "resource_type",
      key: "resource_type",
      width: 180
    },
    {
      title: "资源ID",
      dataIndex: "resource_id",
      key: "resource_id",
      width: 100,
      render: (value: string | null) => value || "-"
    },
    {
      title: "操作者",
      dataIndex: "actor_id",
      key: "actor_id",
      width: 110,
      render: (value: number | null) => value ?? "系统"
    },
    {
      title: "摘要",
      dataIndex: "metadata",
      key: "metadata",
      ellipsis: true,
      render: (value: Record<string, unknown>) => <Typography.Text type="secondary">{metadataBrief(value)}</Typography.Text>
    },
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (value: string) => formatDateTime(value)
    },
    {
      title: "操作",
      key: "operation",
      fixed: "right",
      width: 120,
      render: (_: unknown, record: AuditLogItem) => (
        <Button aria-label="查看审计详情" size="small" onClick={() => setSelectedLog(record)}>
          详情
        </Button>
      )
    }
  ];

  return (
    <AppShell role="admin" title="审计日志" subtitle="平台操作、处方安全与科研导出留痕">
      <Space direction="vertical" size={16} className="onboarding-section admin-audit-page">
        {error ? <Alert type="error" showIcon message="加载审计日志失败，请确认管理员权限。" /> : null}
        <section className="audit-workbench-summary" aria-label="审计监控总览">
          <div>
            <Typography.Title level={4}>审计监控总览</Typography.Title>
            <Typography.Paragraph type="secondary">
              追踪处方生成、反馈调整、专家审核、配置变更与科研导出审批，关键动作可下钻查看结构化元数据。
            </Typography.Paragraph>
          </div>
          <div className="audit-workbench-metrics">
            <div>
              <span>留痕总数</span>
              <strong>{displayTotal}</strong>
            </div>
            <div>
              <span>操作者</span>
              <strong>{actorCount}</strong>
            </div>
            <div>
              <span>处方相关</span>
              <strong>{prescriptionEvents}</strong>
            </div>
            <div>
              <span>安全相关</span>
              <strong>{safetyEvents}</strong>
            </div>
          </div>
        </section>
        <Card>
          <div className="audit-workbench-toolbar">
            <Input
              aria-label="审计筛选"
              placeholder="按动作、资源、操作者、时间或元数据摘要筛选"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="动作类型"
              value={actionFilter}
              onChange={setActionFilter}
              options={[{ value: "all", label: "全部动作" }, ...actionOptions]}
            />
            <Select
              aria-label="资源类型"
              value={resourceFilter}
              onChange={setResourceFilter}
              options={[{ value: "all", label: "全部资源" }, ...resourceOptions]}
            />
            <Typography.Text type="secondary">
              筛选后 {filteredItems.length} / 全部 {displayTotal}
            </Typography.Text>
            <Typography.Text type="secondary">每页 12 条，详情在抽屉中查看</Typography.Text>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
          </div>
          {latestLog ? (
            <div className="audit-latest-strip">
              <Typography.Text strong>最新动作</Typography.Text>
              <Tag color={actionColor(latestLog.action)}>{latestLog.action}</Tag>
              <Typography.Text type="secondary">
                {latestLog.resource_type} #{latestLog.resource_id ?? "-"} · {formatDateTime(latestLog.created_at)}
              </Typography.Text>
            </div>
          ) : null}
          <Table
            rowKey="id"
            className="audit-workbench-table"
            loading={loading}
            columns={columns}
            dataSource={filteredItems}
            pagination={{
              pageSize: 12,
              showSizeChanger: false,
              showTotal: (count, range) => `${range[0]}-${range[1]} / ${count}`
            }}
            scroll={{ x: 1120 }}
            locale={{ emptyText: "暂无审计记录" }}
          />
        </Card>
        <Drawer title="审计详情" width={680} open={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} destroyOnClose>
          {selectedLog ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="动作">
                  <Tag color={actionColor(selectedLog.action)}>{selectedLog.action}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="资源">
                  {selectedLog.resource_type} #{selectedLog.resource_id ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="操作者">{selectedLog.actor_id ?? "系统"}</Descriptions.Item>
                <Descriptions.Item label="时间">{formatDateTime(selectedLog.created_at)}</Descriptions.Item>
              </Descriptions>
              <div>
                <Typography.Text strong>元数据字段</Typography.Text>
                <div className="audit-metadata-list">
                  <MetadataList value={selectedLog.metadata} />
                </div>
              </div>
            </Space>
          ) : null}
        </Drawer>
      </Space>
    </AppShell>
  );
}
