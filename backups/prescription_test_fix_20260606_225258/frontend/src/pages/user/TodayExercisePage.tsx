import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
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
import { AppShell, ContraindicationList, ExerciseTaskCard, FITTVPCard, PainScale, RpeSlider } from "../../components/ProductUI";

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

const HIGH_RISK_DISCOMFORTS = ["胸痛", "胸闷", "晕厥", "严重气短", "气短", "心悸"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TodayExercisePage() {
  const [form] = Form.useForm<FeedbackFormValues>();
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<FeedbackAdjustment | null>(null);
  const discomfortWatch = Form.useWatch("discomfort", form) as string[] | undefined;
  const rpeWatch = Form.useWatch("rpe", form) as number | undefined;
  const painWatch = Form.useWatch("pain_score_after", form) as number | undefined;

  useEffect(() => {
    listMyPrescriptions()
      .then(setPrescriptions)
      .catch(() => setPrescriptions([]));
  }, []);

  const executablePrescription = useMemo(
    () =>
      prescriptions
        .filter((item) => item.status === "PUBLISHED" && item.risk_level !== "R3" && Boolean(item.fitt_vp))
        .sort((left, right) => {
          if (right.version !== left.version) return right.version - left.version;
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        })[0] ?? null,
    [prescriptions]
  );
  const highRiskDiscomfort = (discomfortWatch ?? []).some((item) =>
    HIGH_RISK_DISCOMFORTS.includes(item)
  );
  const highRiskInterruptMessage = "已出现胸痛、晕厥、严重气短或心悸等安全信号，请立即停止运动并尽快进行医学评估。";
  const fitt = executablePrescription?.fitt_vp ?? null;
  const exerciseTypeText = Array.isArray(fitt?.type) ? (fitt?.type as unknown[]).join("、") : String(fitt?.type ?? "-");
  const suggestedTime = String(fitt?.time ?? "-");
  const suggestedIntensity = String(fitt?.intensity ?? "-");
  const todaySuggestion = [suggestedTime, suggestedIntensity, exerciseTypeText]
    .filter((item) => item && item !== "-")
    .join(" / ");

  async function submit(values: FeedbackFormValues) {
    const submittedHighRisk = (values.discomfort ?? []).some((item) =>
      HIGH_RISK_DISCOMFORTS.includes(item)
    );
    if (submittedHighRisk) {
      setNotice("红色安全中断：请先停止运动并进行医学评估，本次打卡不会提交。");
      return;
    }
    setLoading(true);
    setNotice(null);
    setDecision(null);
    try {
      const feedback = await createExerciseFeedback({
        ...values,
        prescription_id: executablePrescription?.id ?? null,
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
    <AppShell role="user" title="今日运动">
        <Modal
          title="红色安全中断"
          open={highRiskDiscomfort}
          closable={false}
          maskClosable={false}
          footer={[
            <Button key="clear" danger onClick={() => form.setFieldValue("discomfort", [])}>
              清除误选
            </Button>,
            <Link key="risk" to="/user/risk-result">
              <Button type="primary" danger>
                查看医学评估建议
              </Button>
            </Link>
          ]}
        >
          <Alert type="error" showIcon message={highRiskInterruptMessage} />
          <Typography.Paragraph className="safety-interrupt-copy">
            系统已暂停本次运动反馈提交。请不要继续训练，记录症状出现时间、强度和持续时长，并优先联系医生或现场专业人员。
          </Typography.Paragraph>
        </Modal>
        <Space direction="vertical" size={16} className="onboarding-section today-exercise-page">
          <section
            className={`today-exercise-pass ${executablePrescription ? "is-open" : "is-locked"}`}
            data-testid="today-exercise-pass"
          >
            <div className="today-exercise-pass-main">
              <Typography.Text className="page-hero-eyebrow">今日训练通行证</Typography.Text>
              <Typography.Title level={3}>{executablePrescription ? "运动打卡" : "当前没有可执行处方"}</Typography.Title>
              <Typography.Text type="secondary">
                运动前核对红旗信号，运动后记录 RPE、疼痛、完成率和不适反应，系统据此触发动态调整或专家复核。
              </Typography.Text>
            </div>
            <div className="today-pass-metrics">
              <div>
                <span>可执行处方</span>
                <strong>{executablePrescription ? `#${executablePrescription.id} · v${executablePrescription.version}` : "无"}</strong>
              </div>
              <div>
                <span>建议时长</span>
                <strong>{suggestedTime}</strong>
              </div>
              <div>
                <span>反馈采集</span>
                <strong>{executablePrescription ? "开放" : "关闭"}</strong>
              </div>
            </div>
          </section>

          <Alert
            showIcon
            type="warning"
            message="运动前如已出现胸痛、胸闷、晕厥、严重气短、心悸等红旗信号，请不要开始训练，并及时咨询专业人员。"
          />

          {executablePrescription ? (
            <Row gutter={[16, 16]} className="today-workbench-grid">
              <Col xs={24} lg={10}>
                <Card className="today-prescription-card" title="今日处方概览">
                  <Space direction="vertical" size={12} className="onboarding-section">
                    <Descriptions bordered column={1} size="small">
                      <Descriptions.Item label="当前处方">
                        <Tag color="green">{executablePrescription.status}</Tag>
                        <span>{executablePrescription.cluster_label || executablePrescription.risk_level}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="今日建议">
                        {todaySuggestion || "请查看处方详情"}
                      </Descriptions.Item>
                    </Descriptions>
                    <ExerciseTaskCard fitt={executablePrescription.fitt_vp} precautions={executablePrescription.precautions} />
                    <FITTVPCard fitt={executablePrescription.fitt_vp} riskLevel={executablePrescription.risk_level} />
                    <ContraindicationList items={executablePrescription.contraindications} />
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card className="today-feedback-workbench" data-testid="today-feedback-workbench" title="动态反馈采集">
                  <Space direction="vertical" size={12} className="onboarding-section">
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
                      <section className="feedback-form-section">
                        <Typography.Text className="feedback-form-section-title">安全确认</Typography.Text>
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
                      </section>

                      <section className="feedback-form-section">
                        <Typography.Text className="feedback-form-section-title">训练记录</Typography.Text>
                        <Row gutter={[12, 0]}>
                          <Col xs={24} sm={12}>
                            <Form.Item name="exercise_date" label="运动日期" rules={[{ required: true, message: "请选择运动日期" }]}>
                              <Input type="date" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Form.Item name="exercise_type" label="运动项目" rules={[{ required: true, message: "请输入运动项目" }]}>
                              <Input />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item name="frequency_week" label="本周第几次" rules={[{ required: true, message: "请输入频次" }]}>
                              <InputNumber min={0} max={14} className="full-width-control" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item name="duration_min" label="运动时长（分钟）" rules={[{ required: true, message: "请输入时长" }]}>
                              <InputNumber min={0} max={240} className="full-width-control" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item name="intensity_level" label="主观强度" rules={[{ required: true, message: "请选择强度" }]}>
                              <Select
                                options={[
                                  { value: "低", label: "低" },
                                  { value: "中", label: "中" },
                                  { value: "高", label: "高" }
                                ]}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                      </section>

                      <section className="feedback-form-section">
                        <Typography.Text className="feedback-form-section-title">主观反馈</Typography.Text>
                        <Row gutter={[12, 0]}>
                          <Col xs={24} sm={8}>
                            <Form.Item name="rpe" label="RPE" rules={[{ required: true, message: "请输入RPE" }]}>
                              <InputNumber min={0} max={20} className="full-width-control" />
                            </Form.Item>
                            <RpeSlider value={rpeWatch ?? 5} />
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item name="completion_rate" label="完成率（%）" rules={[{ required: true, message: "请输入完成率" }]}>
                              <InputNumber min={0} max={100} className="full-width-control" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item name="pain_score_after" label="疼痛评分">
                              <InputNumber min={0} max={10} className="full-width-control" />
                            </Form.Item>
                            <PainScale value={painWatch ?? 0} />
                          </Col>
                          <Col xs={24}>
                            <Form.Item name="discomfort" label="不适反应">
                              <Checkbox.Group
                                options={[
                                  { label: "胸痛", value: "胸痛" },
                                  { label: "疼痛", value: "疼痛" },
                                  { label: "胸闷", value: "胸闷" },
                                  { label: "晕厥", value: "晕厥" },
                                  { label: "头晕", value: "头晕" },
                                  { label: "严重气短", value: "严重气短" },
                                  { label: "气短", value: "气短" },
                                  { label: "心悸", value: "心悸" }
                                ]}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                        {highRiskDiscomfort ? (
                          <Alert
                            className="form-alert"
                            type="error"
                            showIcon
                            message={highRiskInterruptMessage}
                            description="高危反馈不会被作为普通运动打卡提交。请先完成安全处置或清除误选后再继续。"
                          />
                        ) : null}
                      </section>

                      <Space>
                        <Button type="primary" htmlType="submit" loading={loading} disabled={highRiskDiscomfort}>
                          提交打卡并动态调整
                        </Button>
                        <Link to="/user/prescriptions">
                          <Button>我的处方</Button>
                        </Link>
                      </Space>
                    </Form>
                  </Space>
                </Card>
              </Col>
            </Row>
          ) : (
            <Alert
              type="info"
              showIcon
              message="没有 PUBLISHED 且非 R3 的可执行处方。R2 需等待专家审核，R3 仅显示医学评估建议。"
              action={
                <Space>
                  <Link to="/user/prescriptions">
                    <Button size="small">查看处方</Button>
                  </Link>
                  <Link to="/user/health-data">
                    <Button size="small">完善建档</Button>
                  </Link>
                </Space>
              }
            />
          )}
        </Space>
    </AppShell>
  );
}
