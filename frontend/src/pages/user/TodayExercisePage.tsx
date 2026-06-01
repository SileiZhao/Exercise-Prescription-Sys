import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Layout,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { adjustFeedback, type FeedbackAdjustment } from "../../api/feedback";
import { createExerciseFeedback } from "../../api/healthData";
import { listMyPrescriptions, type PrescriptionRecord } from "../../api/prescriptions";

type FeedbackFormValues = {
  pre_exercise_confirmed: boolean;
  exercise_date: string;
  exercise_type: string;
  frequency_week: number;
  duration_min: number;
  intensity_level: string;
  rpe: number;
  completion_rate: number;
  discomfort?: string[];
  pain_score_after?: number;
};

const decisionLabel: Record<string, string> = {
  RED_ALERT: "红色预警",
  REVIEW_REQUIRED: "进入专家复核",
  DEGRADE: "下调负荷",
  PROGRESS: "小幅进阶",
  MAINTAIN: "维持当前处方"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TodayExercisePage() {
  const [form] = Form.useForm<FeedbackFormValues>();
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<FeedbackAdjustment | null>(null);

  useEffect(() => {
    listMyPrescriptions()
      .then(setPrescriptions)
      .catch(() => setPrescriptions([]));
  }, []);

  const latestPublished = useMemo(
    () => prescriptions.find((item) => item.status === "PUBLISHED") ?? prescriptions[0],
    [prescriptions]
  );

  async function submit(values: FeedbackFormValues) {
    setLoading(true);
    setNotice(null);
    setDecision(null);
    try {
      const feedback = await createExerciseFeedback({
        ...values,
        prescription_id: latestPublished?.id ?? null,
        discomfort: values.discomfort ?? []
      });
      const adjustment = await adjustFeedback(Number(feedback.id));
      setDecision(adjustment);
      setNotice(`动态调整结果：${decisionLabel[adjustment.action] ?? adjustment.action}`);
    } catch {
      setNotice("提交打卡失败，请检查处方状态和反馈数据。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          今日运动
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Space direction="vertical" size={16} className="onboarding-section">
          <Card>
            <Space direction="vertical" size={12} className="onboarding-section">
              <Typography.Title level={4}>运动打卡</Typography.Title>
              <Alert
                showIcon
                type="warning"
                message="运动前如已出现胸痛、胸闷、晕厥、严重气短、心悸等红旗信号，请不要开始训练，并及时咨询专业人员。"
              />
              {latestPublished ? (
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="当前处方">
                    <Tag color={latestPublished.status === "PUBLISHED" ? "green" : "orange"}>
                      {latestPublished.status}
                    </Tag>
                    <span>{latestPublished.cluster_label || latestPublished.risk_level}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="今日建议">
                    {latestPublished.fitt_vp ? JSON.stringify(latestPublished.fitt_vp) : "当前无训练计划"}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Alert type="info" showIcon message="暂无处方。可以先完成建档与处方生成，再进行运动打卡。" />
              )}
              {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
              {decision ? (
                <Alert
                  type={decision.action === "RED_ALERT" ? "error" : "info"}
                  showIcon
                  message={decision.reasons.join("；")}
                />
              ) : null}
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  pre_exercise_confirmed: false,
                  exercise_date: today(),
                  exercise_type: "快走",
                  frequency_week: 1,
                  duration_min: 30,
                  intensity_level: "低",
                  rpe: 5,
                  completion_rate: 100,
                  discomfort: [],
                  pain_score_after: 0
                }}
                onFinish={submit}
              >
                <Form.Item
                  name="pre_exercise_confirmed"
                  valuePropName="checked"
                  rules={[
                    {
                      validator: (_, value) =>
                        value
                          ? Promise.resolve()
                          : Promise.reject(new Error("请先确认运动前无红旗风险信号"))
                    }
                  ]}
                >
                  <Checkbox>我确认运动前无胸痛、胸闷、晕厥、严重气短、心悸等红旗风险信号</Checkbox>
                </Form.Item>
                <Form.Item name="exercise_date" label="运动日期" rules={[{ required: true, message: "请选择运动日期" }]}>
                  <Input type="date" />
                </Form.Item>
                <Form.Item name="exercise_type" label="运动项目" rules={[{ required: true, message: "请输入运动项目" }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="frequency_week" label="本周第几次" rules={[{ required: true, message: "请输入频次" }]}>
                  <InputNumber min={0} max={14} className="full-width-control" />
                </Form.Item>
                <Form.Item name="duration_min" label="运动时长（分钟）" rules={[{ required: true, message: "请输入时长" }]}>
                  <InputNumber min={0} max={240} className="full-width-control" />
                </Form.Item>
                <Form.Item name="intensity_level" label="主观强度" rules={[{ required: true, message: "请选择强度" }]}>
                  <Select
                    options={[
                      { value: "低", label: "低" },
                      { value: "中", label: "中" },
                      { value: "高", label: "高" }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="rpe" label="RPE" rules={[{ required: true, message: "请输入RPE" }]}>
                  <InputNumber min={0} max={20} className="full-width-control" />
                </Form.Item>
                <Form.Item name="completion_rate" label="完成率（%）" rules={[{ required: true, message: "请输入完成率" }]}>
                  <InputNumber min={0} max={100} className="full-width-control" />
                </Form.Item>
                <Form.Item name="pain_score_after" label="疼痛评分">
                  <InputNumber min={0} max={10} className="full-width-control" />
                </Form.Item>
                <Form.Item name="discomfort" label="不适反应">
                  <Checkbox.Group
                    options={[
                      { label: "疼痛", value: "疼痛" },
                      { label: "胸闷", value: "胸闷" },
                      { label: "头晕", value: "头晕" },
                      { label: "气短", value: "气短" },
                      { label: "心悸", value: "心悸" }
                    ]}
                  />
                </Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    提交打卡并动态调整
                  </Button>
                  <Link to="/user/prescriptions">
                    <Button>我的处方</Button>
                  </Link>
                </Space>
              </Form>
            </Space>
          </Card>
        </Space>
      </Layout.Content>
    </Layout>
  );
}
