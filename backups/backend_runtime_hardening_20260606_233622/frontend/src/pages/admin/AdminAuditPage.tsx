import { Alert, Button, Card, Space, Table, Tag, Typography } from "antd";
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

const columns: ColumnsType<AuditLogItem> = [
  {
    title: "动作",
    dataIndex: "action",
    key: "action",
    render: (value: string) => <Tag color="blue">{value}</Tag>
  },
  {
    title: "资源",
    dataIndex: "resource_type",
    key: "resource_type"
  },
  {
    title: "资源ID",
    dataIndex: "resource_id",
    key: "resource_id",
    render: (value: string | null) => value || "-"
  },
  {
    title: "操作者",
    dataIndex: "actor_id",
    key: "actor_id",
    render: (value: number | null) => value ?? "系统"
  },
  {
    title: "元数据",
    dataIndex: "metadata",
    key: "metadata",
    render: (value: Record<string, unknown>) => <MetadataList value={value} />
  },
  {
    title: "时间",
    dataIndex: "created_at",
    key: "created_at"
  }
];

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  return (
    <AppShell role="admin" title="审计日志">
        <Space direction="vertical" size={16} className="onboarding-section">
          {error ? <Alert type="error" showIcon message="加载审计日志失败，请确认管理员权限。" /> : null}
          <Space>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
            <Typography.Text type="secondary">共 {total} 条留痕记录</Typography.Text>
          </Space>
          <Card className="dashboard-panel">
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={items}
              pagination={false}
              scroll={{ x: 920 }}
              locale={{ emptyText: "暂无审计记录" }}
            />
          </Card>
        </Space>
    </AppShell>
  );
}
