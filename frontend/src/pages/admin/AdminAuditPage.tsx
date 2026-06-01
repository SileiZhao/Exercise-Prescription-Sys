import { Alert, Button, Card, Layout, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listAuditLogs, type AuditLogItem } from "../../api/adminAudit";

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
    render: (value: Record<string, unknown>) => JSON.stringify(value)
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
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          审计日志
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
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
      </Layout.Content>
    </Layout>
  );
}
