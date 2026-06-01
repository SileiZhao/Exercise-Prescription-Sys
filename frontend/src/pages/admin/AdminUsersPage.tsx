import { Alert, Button, Card, Col, Form, Input, InputNumber, Layout, Row, Select, Space, Table, Tag, Typography } from "antd";
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

const roleOptions: { label: string; value: UserRole }[] = [
  { label: "普通用户", value: "USER" },
  { label: "专家", value: "EXPERT" },
  { label: "管理员", value: "ADMIN" },
  { label: "科研人员", value: "RESEARCHER" },
  { label: "机构管理员", value: "ORG_ADMIN" }
];

const organizationTypeOptions = [
  { label: "社区", value: "COMMUNITY" },
  { label: "学校", value: "SCHOOL" },
  { label: "体育场馆", value: "GYM" },
  { label: "医院", value: "HOSPITAL" },
  { label: "企业", value: "ENTERPRISE" },
  { label: "其他", value: "OTHER" }
];

function yesNo(value: boolean) {
  return <Tag color={value ? "green" : "default"}>{value ? "是" : "否"}</Tag>;
}

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
  }

  async function changeUserPage(page: number, pageSize: number) {
    const nextFilters = { ...userFilters, page, page_size: pageSize };
    setUserFilters(nextFilters);
    await refreshAll(nextFilters);
  }

  async function saveUser(values: UserUpdatePayload & { user_id: number }) {
    setSaving(true);
    setNotice(null);
    try {
      const { user_id, ...payload } = values;
      await updateUser(user_id, payload);
      await refreshAll(userFilters);
      userForm.resetFields();
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
      setNotice("专家资料已保存，可进入 R2 审核任务分配。");
    } catch {
      setNotice("保存专家资料失败，请确认用户角色和字段。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          用户与专家管理
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
          <Space wrap>
            <Link to="/admin/dashboard">
              <Button>返回看板</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>审计日志</Button>
            </Link>
          </Space>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={16}>
              <Card title="用户列表">
                <Form form={filterForm} layout="vertical" onFinish={filterUsers} className="compact-filter-form">
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item name="q" label="用户关键词">
                        <Input placeholder="邮箱、姓名或手机号" allowClear />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="role" label="角色筛选">
                        <Select allowClear options={roleOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={5}>
                      <Form.Item name="organization_id" label="机构ID">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={3}>
                      <Form.Item label=" ">
                        <Button type="primary" htmlType="submit" block>
                          筛选用户
                        </Button>
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={users}
                  pagination={{
                    current: userFilters.page ?? 1,
                    pageSize: userFilters.page_size ?? 10,
                    total: totalUsers,
                    showSizeChanger: true,
                    onChange: changeUserPage
                  }}
                  scroll={{ x: 960 }}
                  locale={{ emptyText: "暂无用户，请先完成注册或种子数据初始化。" }}
                  columns={[
                    { title: "邮箱", dataIndex: "email" },
                    { title: "姓名", dataIndex: "full_name" },
                    { title: "角色", dataIndex: "role", render: (value: UserRole) => <Tag>{value}</Tag> },
                    { title: "机构ID", dataIndex: "organization_id", render: (value: number | null) => value ?? "-" },
                    { title: "启用", dataIndex: "is_active", render: yesNo },
                    { title: "已验证", dataIndex: "is_verified", render: yesNo }
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="用户权限维护">
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
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="机构管理">
                <OrganizationForm form={organizationForm} saving={saving} onFinish={saveOrganization} />
                <Table
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
                    { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{value}</Tag> }
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="专家资料">
                <ExpertProfileForm form={expertForm} expertUserOptions={expertUserOptions} saving={saving} onFinish={saveExpertProfile} />
                <Table
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
                    { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{value}</Tag> }
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Space>
      </Layout.Content>
    </Layout>
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
