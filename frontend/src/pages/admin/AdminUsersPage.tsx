import { Alert, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Row, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  createExpertProfile,
  createOrganization,
  listExpertProfiles,
  listOrganizations,
  listUsers,
  updateUser,
  type AdminUser,
  type ExpertProfile,
  type ExpertProfilePayload,
  type Organization,
  type OrganizationPayload,
  type UserListParams,
  type UserRole,
  type UserUpdatePayload
} from "../../api/adminUsers";
import { AppShell, ClinicalStatusBadge, DataTableSummary, DecisionBanner, formatStatusLabel, statusTagColor, StatusTile, WorkbenchSection } from "../../components/ProductUI";

const roleOptions: { label: string; value: UserRole }[] = [
  { label: "普通用户", value: "USER" },
  { label: "专家", value: "EXPERT" },
  { label: "管理员", value: "ADMIN" },
  { label: "科研人员", value: "RESEARCHER" },
  { label: "机构管理员", value: "ORG_ADMIN" }
];

function roleLabel(value?: UserRole | string | null) {
  return roleOptions.find((item) => item.value === value)?.label ?? String(value ?? "-");
}

const organizationTypeOptions = [
  { label: "社区", value: "COMMUNITY" },
  { label: "学校", value: "SCHOOL" },
  { label: "体育场馆", value: "GYM" },
  { label: "医院", value: "HOSPITAL" },
  { label: "企业", value: "ENTERPRISE" },
  { label: "其他", value: "OTHER" }
];

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [expertProfiles, setExpertProfiles] = useState<ExpertProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [userFilters, setUserFilters] = useState<UserListParams>({ page: 1, page_size: 10 });
  const [userForm] = Form.useForm<UserUpdatePayload & { user_id: number }>();
  const [filterForm] = Form.useForm<UserListParams>();
  const [organizationForm] = Form.useForm<OrganizationPayload>();
  const [expertForm] = Form.useForm<ExpertProfilePayload>();
  const [taskDrawer, setTaskDrawer] = useState<"user" | "organization" | "expert" | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const expertUserOptions = useMemo(
    () =>
      users
        .filter((user) => user.role === "EXPERT")
        .map((user) => ({ label: `${user.full_name || user.email}（${user.email}）`, value: user.id })),
    [users]
  );

  const refreshAll = useCallback(async (filters: UserListParams) => {
    setLoading(true);
    try {
      const [userData, orgData, expertData] = await Promise.all([listUsers(filters), listOrganizations(), listExpertProfiles()]);
      setUsers(userData.items);
      setTotalUsers(userData.total);
      setOrganizations(orgData);
      setExpertProfiles(expertData);
      setNotice(null);
    } catch {
      setNotice("用户、机构或专家资料加载失败，请确认管理员权限。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll({ page: 1, page_size: 10 });
  }, [refreshAll]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }
    if (!users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  async function filterUsers(values: UserListParams) {
    const nextFilters: UserListParams = {
      q: values.q?.trim() || undefined,
      role: values.role,
      organization_id: values.organization_id,
      page: 1,
      page_size: userFilters.page_size ?? 10
    };
    setUserFilters(nextFilters);
    await refreshAll(nextFilters);
    setFilterDrawerOpen(false);
  }

  async function changeUserPage(page: number, pageSize: number) {
    const nextFilters = { ...userFilters, page, page_size: pageSize };
    setUserFilters(nextFilters);
    await refreshAll(nextFilters);
  }

  async function applyQuickFilter(next: UserListParams) {
    const mergedFilters: UserListParams = {
      ...userFilters,
      ...next,
      page: 1,
      page_size: userFilters.page_size ?? 10
    };
    setUserFilters(mergedFilters);
    filterForm.setFieldsValue({
      q: mergedFilters.q,
      role: mergedFilters.role,
      organization_id: mergedFilters.organization_id
    });
    await refreshAll(mergedFilters);
  }

  async function saveUser(values: UserUpdatePayload & { user_id: number }) {
    setSaving(true);
    setNotice(null);
    try {
      const { user_id, ...payload } = values;
      await updateUser(user_id, payload);
      await refreshAll(userFilters);
      userForm.resetFields();
      setTaskDrawer(null);
      setNotice("用户权限与状态已更新。");
    } catch {
      setNotice("保存用户失败，请检查角色、机构或权限。");
    } finally {
      setSaving(false);
    }
  }

  async function saveOrganization(values: OrganizationPayload) {
    setSaving(true);
    setNotice(null);
    try {
      await createOrganization(values);
      await refreshAll(userFilters);
      organizationForm.resetFields();
      setTaskDrawer(null);
      setNotice("机构已保存，可用于用户归属和机构管理员隔离。");
    } catch {
      setNotice("保存机构失败，请确认管理员权限和字段。");
    } finally {
      setSaving(false);
    }
  }

  async function saveExpertProfile(values: ExpertProfilePayload) {
    setSaving(true);
    setNotice(null);
    try {
      await createExpertProfile(values);
      await refreshAll(userFilters);
      expertForm.resetFields();
      setTaskDrawer(null);
      setNotice("专家资料已保存，可进入 R2 审核任务分配。");
    } catch {
      setNotice("保存专家资料失败，请确认用户角色和字段。");
    } finally {
      setSaving(false);
    }
  }

  function openUserTask(user?: AdminUser | null) {
    if (user) {
      userForm.setFieldsValue({
        user_id: user.id,
        role: user.role,
        organization_id: user.organization_id ?? undefined,
        is_active: user.is_active,
        is_verified: user.is_verified
      });
    }
    setTaskDrawer("user");
  }

  const activeUsers = users.filter((user) => user.is_active).length;
  const expertUsers = users.filter((user) => user.role === "EXPERT").length;
  const inactiveUsers = users.length - activeUsers;
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const selectedOrganization = organizations.find((organization) => organization.id === selectedUser?.organization_id) ?? null;
  const selectedExpertProfile = expertProfiles.find((profile) => profile.user_id === selectedUser?.id) ?? null;
  const roleDistribution = roleOptions
    .map((option) => ({
      ...option,
      count: users.filter((user) => user.role === option.value).length
    }))
    .filter((item) => item.count > 0);

  return (
    <AppShell
      role="admin"
      title="身份治理台"
      subtitle="维护账号角色、机构隔离和专家审核能力"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={inactiveUsers ? "degraded" : "ready"} label={`停用 ${inactiveUsers}`} />
          <ClinicalStatusBadge type="review" value={expertProfiles.length ? "approved" : "pending"} label={`专家资料 ${expertProfiles.length}`} />
        </>
      }
    >
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={inactiveUsers ? "warning" : "info"}
            title="账号角色和专家资料决定工作台可见范围"
            description="普通用户、专家、管理员、科研人员和机构管理员使用不同工作台。专家用户需要专家资料后才能稳定承接 R2 审核任务。"
            meta={
              <>
                <ClinicalStatusBadge type="readiness" value={activeUsers ? "ready" : "degraded"} label={`启用用户 ${activeUsers}/${users.length}`} />
                <ClinicalStatusBadge type="review" value={expertProfiles.length ? "approved" : "pending"} label={`专家资料 ${expertProfiles.length}/${expertUsers}`} />
                <ClinicalStatusBadge type="readiness" value={organizations.length ? "ready" : "degraded"} label={`机构 ${organizations.length}`} />
              </>
            }
          />
          <div className="status-grid">
            <StatusTile label="启用用户" value={`${activeUsers}/${users.length}`} detail="停用账号无法进入业务页面" tone={inactiveUsers ? "warning" : "safe"} />
            <StatusTile label="专家账号" value={expertUsers} detail={`${expertProfiles.length} 份专家资料`} tone={expertProfiles.length >= expertUsers && expertUsers ? "safe" : "warning"} />
            <StatusTile label="试点机构" value={organizations.length} detail="用于机构管理员隔离" tone={organizations.length ? "safe" : "warning"} />
          </div>
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>审计日志</Button>
            </Link>
          </Space>

          <WorkbenchSection
            title="用户权限维护"
            description="默认列表只保留账号、角色、状态和归属，详细资料与修改动作进入选中账号详情。"
            primaryAction={
              <Button type="primary" onClick={() => openUserTask(selectedUser)} disabled={!selectedUser}>
                修改选中账号
              </Button>
            }
            secondaryActions={
              <Space wrap>
                <Button onClick={() => setFilterDrawerOpen(true)}>筛选用户</Button>
                <Button onClick={() => void applyQuickFilter({ role: "EXPERT" })}>专家</Button>
                <Button onClick={() => void applyQuickFilter({ role: undefined, q: undefined, organization_id: undefined })}>全部账号</Button>
              </Space>
            }
          >
          <div className="panel-toolbar">
            <div>
              <Typography.Text strong>账号列表</Typography.Text>
              <Typography.Paragraph type="secondary">
                点击行查看账号详情；权限修改、机构归属和启停状态统一从详情动作进入。
              </Typography.Paragraph>
            </div>
          </div>
          <div className="identity-workbench-grid">
            <div>
              <Card title="用户列表">
                <DataTableSummary
                  title={`当前筛选 ${totalUsers} 个账号`}
                  description="默认列控制在账号、角色、状态、机构和创建时间，避免把手机号、验证细节和维护按钮全部铺在列表里。"
                  meta={
                    <Space wrap>
                      {userFilters.role ? <Tag>{roleOptions.find((item) => item.value === userFilters.role)?.label ?? userFilters.role}</Tag> : <Tag>全部角色</Tag>}
                      {userFilters.q ? <Tag>关键词：{userFilters.q}</Tag> : null}
                      {userFilters.organization_id ? <Tag>机构 {userFilters.organization_id}</Tag> : null}
                    </Space>
                  }
                />
                <Table
                  className="compact-governance-table"
                  rowKey="id"
                  loading={loading}
                  dataSource={users}
                  rowClassName={(record) => (record.id === selectedUser?.id ? "identity-row-selected" : "")}
                  onRow={(record) => ({
                    onClick: () => setSelectedUserId(record.id)
                  })}
                  pagination={{
                    current: userFilters.page ?? 1,
                    pageSize: userFilters.page_size ?? 10,
                    total: totalUsers,
                    showSizeChanger: true,
                    onChange: changeUserPage
                  }}
                  scroll={{ x: 720 }}
                  locale={{ emptyText: "暂无用户，请先完成注册或种子数据初始化。" }}
                  columns={[
                    {
                      title: "账号",
                      render: (_: unknown, record: AdminUser) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text strong>{record.full_name || record.email}</Typography.Text>
                          <Typography.Text type="secondary">{record.email}</Typography.Text>
                        </Space>
                      )
                    },
                    { title: "角色", dataIndex: "role", render: (value: UserRole) => <Tag>{roleLabel(value)}</Tag> },
                    {
                      title: "状态",
                      render: (_: unknown, record: AdminUser) => (
                        <Space wrap size={4}>
                          <Tag color={record.is_active ? "green" : "default"}>{record.is_active ? "启用" : "停用"}</Tag>
                          <Tag color={record.is_verified ? "blue" : "default"}>{record.is_verified ? "已验证" : "未验证"}</Tag>
                        </Space>
                      )
                    },
                    {
                      title: "机构",
                      dataIndex: "organization_id",
                      render: (value: number | null) => organizations.find((item) => item.id === value)?.name ?? value ?? "-"
                    },
                    {
                      title: "创建时间",
                      dataIndex: "created_at",
                      render: (value: string) => value ? value.slice(0, 10) : "-"
                    },
                    {
                      title: "详情",
                      render: (_: unknown, record: AdminUser) => (
                        <Typography.Text type="secondary">{record.id === selectedUser?.id ? "已选中" : "点选查看"}</Typography.Text>
                      )
                    }
                  ]}
                />
              </Card>
            </div>
            <aside className="identity-detail-rail">
              <Card title="选中账号" className="dashboard-panel">
                {selectedUser ? (
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Space wrap>
                      <Tag color={selectedUser.is_active ? "green" : "default"}>{selectedUser.is_active ? "启用" : "停用"}</Tag>
                      <Tag>{roleLabel(selectedUser.role)}</Tag>
                      {selectedExpertProfile ? <Tag color="blue">专家资料已建</Tag> : null}
                    </Space>
                    <Typography.Title level={5} className="identity-user-title">
                      {selectedUser.full_name || selectedUser.email}
                    </Typography.Title>
                    <Typography.Text type="secondary">{selectedUser.email}</Typography.Text>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="用户 ID">{selectedUser.id}</Descriptions.Item>
                      <Descriptions.Item label="机构">
                        {selectedOrganization ? selectedOrganization.name : selectedUser.organization_id ?? "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="验证状态">{selectedUser.is_verified ? "已验证" : "未验证"}</Descriptions.Item>
                      <Descriptions.Item label="专家容量">
                        {selectedExpertProfile ? `${selectedExpertProfile.review_capacity_per_day} / 日` : "未配置"}
                      </Descriptions.Item>
                    </Descriptions>
                    <Button onClick={() => openUserTask(selectedUser)}>
                      修改该账号权限
                    </Button>
                  </Space>
                ) : (
                  <Typography.Text type="secondary">从左侧列表选择一个账号。</Typography.Text>
                )}
              </Card>
              <Card title="角色分布" className="dashboard-panel">
                <div className="identity-role-list">
                  {roleDistribution.map((item) => (
                    <div className="identity-role-item" key={item.value}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            </aside>
          </div>
          <Drawer
            title="筛选用户"
            width={460}
            open={filterDrawerOpen}
            onClose={() => setFilterDrawerOpen(false)}
            destroyOnClose
          >
            <Form form={filterForm} layout="vertical" onFinish={filterUsers}>
              <Form.Item name="q" label="用户关键词">
                <Input placeholder="邮箱、姓名或手机号" allowClear />
              </Form.Item>
              <Form.Item name="role" label="角色筛选">
                <Select allowClear options={roleOptions} />
              </Form.Item>
              <Form.Item name="organization_id" label="机构ID">
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  应用筛选
                </Button>
                <Button
                  onClick={() => {
                    filterForm.resetFields();
                    void filterUsers({});
                  }}
                >
                  清空筛选
                </Button>
              </Space>
            </Form>
          </Drawer>
          </WorkbenchSection>

          <WorkbenchSection
            title="机构与专家资料"
            description="机构控制归属隔离，专家资料控制审核能力和日审核容量；低频创建动作保留在本区右侧。"
            secondaryActions={
              <Space wrap>
                <Button onClick={() => setTaskDrawer("organization")}>新建机构</Button>
                <Button onClick={() => setTaskDrawer("expert")}>维护专家资料</Button>
              </Space>
            }
          >
          <div className="panel-toolbar">
            <div>
              <Typography.Text strong>机构与专家档案</Typography.Text>
              <Typography.Paragraph type="secondary">创建机构和专家资料是低频治理动作，不应长期占用页面主体空间。</Typography.Paragraph>
            </div>
          </div>
          <Card className="dashboard-panel">
            <Tabs
              items={[
                {
                  key: "organizations",
                  label: "机构资料",
                  children: (
                    <Table
                      className="compact-governance-table"
                      rowKey="id"
                      loading={loading}
                      dataSource={organizations}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: "暂无机构，请创建试点机构。" }}
                      columns={[
                        { title: "机构", dataIndex: "name" },
                        { title: "类型", dataIndex: "type" },
                        { title: "联系人", dataIndex: "contact_person", render: (value: string | null) => value ?? "-" },
                        { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={statusTagColor(value)}>{formatStatusLabel(value, "general")}</Tag> }
                      ]}
                    />
                  )
                },
                {
                  key: "experts",
                  label: "专家资料",
                  children: (
                    <Table
                      className="compact-governance-table"
                      rowKey="id"
                      loading={loading}
                      dataSource={expertProfiles}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: "暂无专家资料，请先为专家用户建档。" }}
                      columns={[
                        { title: "专家", render: (_: unknown, record: ExpertProfile) => record.user?.full_name || record.user?.email || record.user_id },
                        { title: "职称", dataIndex: "title", render: (value: string | null) => value ?? "-" },
                        { title: "专长", dataIndex: "specialty", render: (value: string | null) => value ?? "-" },
                        { title: "日审核量", dataIndex: "review_capacity_per_day" },
                        { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={statusTagColor(value)}>{formatStatusLabel(value, "general")}</Tag> }
                      ]}
                    />
                  )
                }
              ]}
            />
          </Card>
          </WorkbenchSection>
          <Drawer
            title={
              taskDrawer === "user"
                ? "修改用户权限"
                : taskDrawer === "organization"
                  ? "新建机构"
                  : "维护专家资料"
            }
            width={560}
            open={Boolean(taskDrawer)}
            onClose={() => setTaskDrawer(null)}
            destroyOnClose
          >
            {taskDrawer === "user" ? (
              <Form form={userForm} layout="vertical" onFinish={saveUser}>
                <Form.Item name="user_id" label="用户" rules={[{ required: true, message: "请选择用户" }]}>
                  <Select
                    options={users.map((user) => ({ label: `${user.full_name || user.email}（${user.email}）`, value: user.id }))}
                    loading={loading}
                  />
                </Form.Item>
                <Form.Item name="role" label="角色">
                  <Select options={roleOptions} />
                </Form.Item>
                <Form.Item name="organization_id" label="机构ID">
                  <InputNumber min={1} style={{ width: "100%" }} />
                </Form.Item>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="is_active" label="启用">
                      <Select options={[{ label: "是", value: true }, { label: "否", value: false }]} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="is_verified" label="已验证">
                      <Select options={[{ label: "是", value: true }, { label: "否", value: false }]} />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit" loading={saving}>
                  保存用户
                </Button>
              </Form>
            ) : taskDrawer === "organization" ? (
              <OrganizationForm form={organizationForm} saving={saving} onFinish={saveOrganization} />
            ) : taskDrawer === "expert" ? (
              <ExpertProfileForm form={expertForm} expertUserOptions={expertUserOptions} saving={saving} onFinish={saveExpertProfile} />
            ) : null}
          </Drawer>
        </Space>
    </AppShell>
  );
}

function OrganizationForm({
  form,
  saving,
  onFinish
}: {
  form: ReturnType<typeof Form.useForm<OrganizationPayload>>[0];
  saving: boolean;
  onFinish: (values: OrganizationPayload) => void;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ type: "COMMUNITY" }}>
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="name" label="机构名称" rules={[{ required: true, message: "请填写机构名称" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="type" label="机构类型">
            <Select options={organizationTypeOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="contact_person" label="联系人">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="contact_phone" label="联系电话">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Button htmlType="submit" loading={saving}>
        保存机构
      </Button>
    </Form>
  );
}

function ExpertProfileForm({
  form,
  expertUserOptions,
  saving,
  onFinish
}: {
  form: ReturnType<typeof Form.useForm<ExpertProfilePayload>>[0];
  expertUserOptions: { label: string; value: number }[];
  saving: boolean;
  onFinish: (values: ExpertProfilePayload) => void;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ review_capacity_per_day: 20 }}>
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="user_id" label="专家用户" rules={[{ required: true, message: "请选择专家用户" }]}>
            <Select options={expertUserOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="title" label="职称">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="specialty" label="专业方向">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="certificate_no" label="证书编号">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="review_capacity_per_day" label="每日审核量">
            <InputNumber min={1} max={200} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="bio" label="简介">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Col>
      </Row>
      <Button htmlType="submit" loading={saving}>
        保存专家资料
      </Button>
    </Form>
  );
}
