import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
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
import { getUserDashboard, type UserDashboardSummary } from "../../api/userDashboard";
import {
  AppShell,
  ClinicalStatusBadge,
  ContraindicationList,
  DataNote,
  DecisionBanner,
  ExerciseTaskCard,
  FITTVPCard,
  formatStatusLabel,
  PainScale,
  RpeSlider,
  statusTagColor,
  StatusTile,
  WorkbenchSection
} from "../../components/ProductUI";

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [contactRequested, setContactRequested] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<UserDashboardSummary | null>(null);
  const discomfortWatch = Form.useWatch("discomfort", form) as string[] | undefined;
  const rpeWatch = Form.useWatch("rpe", form) as number | undefined;
  const painWatch = Form.useWatch("pain_score_after", form) as number | undefined;

  useEffect(() => {
    listMyPrescriptions()
      .then(setPrescriptions)
      .catch(() => setPrescriptions([]));
    getUserDashboard()
      .then(setDashboardSummary)
      .catch(() => setDashboardSummary(null));
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
  const lockedPrescription = useMemo(
    () =>
      executablePrescription
        ? null
        : [...prescriptions].sort((left, right) => {
            const riskWeight = (level: string) => (level === "R3" ? 3 : level === "R2" ? 2 : level === "R1" ? 1 : 0);
            const riskDelta = riskWeight(right.risk_level) - riskWeight(left.risk_level);
            if (riskDelta !== 0) return riskDelta;
            return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
          })[0] ?? null,
    [executablePrescription, prescriptions]
  );
  const lockedRiskLevel = lockedPrescription?.risk_level ?? dashboardSummary?.current_risk_level ?? null;
  const referralLocked = lockedRiskLevel === "R3" || (dashboardSummary?.current_risk_level === "R3" && dashboardSummary.today_can_exercise === false);
  const reviewLocked =
    lockedRiskLevel === "R2" &&
    (lockedPrescription ? lockedPrescription.status !== "PUBLISHED" : dashboardSummary?.today_can_exercise === false);
  const highRiskDiscomfort = (discomfortWatch ?? []).some((item) =>
    HIGH_RISK_DISCOMFORTS.includes(item)
  );
  const highRiskInterruptMessage = "已出现胸痛、晕厥、严重气短或心悸等安全信号，请立即停止运动并尽快进行医学评估。";
  const gateTone = highRiskDiscomfort ? "danger" : executablePrescription ? "safe" : "warning";

  function recordSafetyInterrupt() {
    setNotice("已保留红色安全中断提示：请停止运动，记录症状，并联系医生或现场专业人员。");
    setContactRequested(false);
    setFeedbackOpen(false);
    form.setFieldValue("discomfort", []);
  }

  function requestExpertContact() {
    setContactRequested(true);
  }

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
    <AppShell
      role="user"
      title="运动前安全闸门"
      subtitle="先确认是否可运动，再执行处方并提交反馈"
      statusItems={
        <>
          <ClinicalStatusBadge type="exercise" value={Boolean(executablePrescription) && !highRiskDiscomfort} label={executablePrescription && !highRiskDiscomfort ? "可进入打卡" : "训练入口受限"} />
          <ClinicalStatusBadge type="review" value={decision?.action === "REVIEW_REQUIRED" ? "pending_review" : "pending"} label={decision ? decisionLabel[decision.action] ?? decision.action : "未提交反馈"} />
        </>
      }
    >
        <Modal
          title="红色安全中断"
          open={highRiskDiscomfort}
          closable={false}
          maskClosable={false}
          footer={[
            <Button
              key="clear"
              onClick={() => {
                setContactRequested(false);
                form.setFieldValue("discomfort", []);
              }}
            >
              清除误选
            </Button>,
            <Button key="record" type="primary" danger onClick={recordSafetyInterrupt}>
              停止并保存异常
            </Button>
          ]}
        >
          <Alert type="error" showIcon message={highRiskInterruptMessage} />
          {contactRequested ? (
            <Alert
              className="safety-interrupt-copy"
              type="warning"
              showIcon
              message="请立即联系机构专家、医生或现场专业人员"
              description="如伴随持续胸痛、晕厥、明显呼吸困难或症状加重，应优先寻求急救或线下医疗评估。"
            />
          ) : null}
          <Typography.Paragraph className="safety-interrupt-copy">
            系统已暂停本次运动反馈提交。请不要继续训练，记录症状出现时间、强度和持续时长，并优先联系医生或现场专业人员。
          </Typography.Paragraph>
          <Space wrap className="safety-interrupt-links">
            <Button onClick={requestExpertContact}>联系专家/医生</Button>
            <Link to="/user/risk-result">
              <Button>查看医学评估建议</Button>
            </Link>
            <Link to="/user/dashboard">
              <Button>返回安全首页</Button>
            </Link>
          </Space>
        </Modal>
        <Space direction="vertical" size={16} className="onboarding-section">
          <DecisionBanner
            tone={gateTone}
            title={
              highRiskDiscomfort
                ? "已触发红色安全中断"
                : executablePrescription
                  ? "当前有可执行处方，先完成运动前确认"
                  : referralLocked || reviewLocked
                    ? "训练入口已锁定"
                    : "当前没有可执行处方"
            }
            description={
              highRiskDiscomfort
                ? highRiskInterruptMessage
                : executablePrescription
                  ? "确认运动前无红旗信号后再提交打卡。任何胸痛、晕厥、严重气短或心悸都会暂停普通反馈提交。"
                  : referralLocked
                    ? "R3 安全边界下不开放今日训练打卡，请先查看医学评估或转介建议。"
                    : reviewLocked
                      ? "R2 处方需等待专家审核发布后才开放今日训练打卡。"
                      : "没有已发布且非 R3 的处方时，不开放今日训练打卡。请先查看处方发布状态或补充建档资料。"
            }
            meta={
              <>
                <ClinicalStatusBadge type="exercise" value={Boolean(executablePrescription) && !highRiskDiscomfort} label={executablePrescription && !highRiskDiscomfort ? "训练入口开放" : "训练入口锁定"} />
                <ClinicalStatusBadge type="risk" value={executablePrescription?.risk_level ?? lockedRiskLevel} />
              </>
            }
            actions={
              executablePrescription ? (
                <Link to="/user/prescriptions">
                  <Button>查看处方版本</Button>
                </Link>
              ) : referralLocked ? (
                <Link to="/user/risk-result">
                  <Button type="primary">查看医学评估建议</Button>
                </Link>
              ) : reviewLocked ? (
                <Link to="/user/prescriptions">
                  <Button type="primary">查看审核状态</Button>
                </Link>
              ) : (
                <Link to="/user/prescriptions">
                  <Button type="primary">查看处方状态</Button>
                </Link>
              )
            }
          />
          <div className="status-grid">
            <StatusTile label="处方状态" value={executablePrescription ? formatStatusLabel(executablePrescription.status, "review") : "无可执行处方"} detail={executablePrescription ? `v${executablePrescription.version}` : "等待发布"} tone={executablePrescription ? "safe" : "warning"} />
            <StatusTile label="红旗信号" value={highRiskDiscomfort ? "已触发" : "未触发"} detail="胸痛、晕厥、严重气短、心悸" tone={highRiskDiscomfort ? "danger" : "safe"} />
            <StatusTile label="动态调整" value={decision ? decisionLabel[decision.action] ?? decision.action : "待提交"} detail="提交反馈后生成建议" tone={decision?.action === "RED_ALERT" ? "danger" : "info"} />
          </div>
          <div className="today-workbench-grid">
            <WorkbenchSection title={executablePrescription ? "今日处方任务" : "训练入口状态"} description="先核对处方版本、今日建议、禁忌动作和停止运动条件。">
            <Space direction="vertical" size={12} className="onboarding-section">
              <Alert
                showIcon
                type="warning"
                message="运动前如已出现胸痛、胸闷、晕厥、严重气短、心悸等红旗信号，请不要开始训练，并及时咨询专业人员。"
              />
              {executablePrescription ? (
                <>
                  <Descriptions bordered column={1} size="small">
                    <Descriptions.Item label="当前处方">
                      <Tag color={statusTagColor(executablePrescription.status)}>{formatStatusLabel(executablePrescription.status, "review")}</Tag>
                      <span>{executablePrescription.cluster_label || executablePrescription.risk_level}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="今日建议">
                      {[
                        executablePrescription.fitt_vp?.time,
                        executablePrescription.fitt_vp?.intensity,
                        Array.isArray(executablePrescription.fitt_vp?.type)
                          ? executablePrescription.fitt_vp.type.join("、")
                          : executablePrescription.fitt_vp?.type
                      ]
                        .filter(Boolean)
                        .map(String)
                        .join(" / ")}
                    </Descriptions.Item>
                  </Descriptions>
                  <ExerciseTaskCard fitt={executablePrescription.fitt_vp} precautions={executablePrescription.precautions} />
                  <FITTVPCard
                    fitt={executablePrescription.fitt_vp}
                    riskLevel={executablePrescription.risk_level}
                    precautions={executablePrescription.precautions}
                  />
                  <ContraindicationList items={executablePrescription.contraindications} />
                </>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="没有已发布且非 R3 的可执行处方。R2 需等待专家审核，R3 仅显示医学评估建议。"
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
            </WorkbenchSection>
            <WorkbenchSection title="运动反馈" description="反馈用于动态调整，红旗信号会阻断普通提交。">
              <Space direction="vertical" size={12} className="onboarding-section">
              {notice ? <Alert type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
              {decision ? (
                <Alert
                  type={decision.action === "RED_ALERT" ? "error" : "info"}
                  showIcon
                  message={decision.reasons.join("；")}
                />
              ) : null}
              {executablePrescription ? (
                <>
                  <div className="panel-toolbar">
                    <div>
                      <Typography.Text strong>本次反馈尚未提交</Typography.Text>
                      <Typography.Paragraph type="secondary">运动完成后再记录反馈；红旗信号会立即触发安全中断。</Typography.Paragraph>
                    </div>
                    <Button type="primary" onClick={() => setFeedbackOpen(true)}>记录运动反馈</Button>
                  </div>
                  <Drawer title="记录运动反馈" width={560} open={feedbackOpen} onClose={() => setFeedbackOpen(false)} destroyOnClose className="task-drawer">
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
                      onFinish={(values) => {
                        void submit(values);
                        setFeedbackOpen(false);
                      }}
                    >
                      <section className="drawer-field-section">
                        <Typography.Text strong>基础信息</Typography.Text>
                        <Typography.Paragraph type="secondary">记录本次运动项目、日期、时长和主观强度。</Typography.Paragraph>
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
                      </section>
                      <section className="drawer-field-section drawer-field-section-critical">
                        <Typography.Text strong>关键条件</Typography.Text>
                        <Typography.Paragraph type="secondary">RPE、疼痛和不适反应用于判断是否需要暂停或复核。</Typography.Paragraph>
                        <Form.Item name="rpe" label="RPE" rules={[{ required: true, message: "请输入RPE" }]}>
                          <InputNumber min={0} max={20} className="full-width-control" />
                        </Form.Item>
                        <RpeSlider value={rpeWatch ?? 5} />
                        <Form.Item name="completion_rate" label="完成率（%）" rules={[{ required: true, message: "请输入完成率" }]}>
                          <InputNumber min={0} max={100} className="full-width-control" />
                        </Form.Item>
                        <Form.Item name="pain_score_after" label="疼痛评分">
                          <InputNumber min={0} max={10} className="full-width-control" />
                        </Form.Item>
                        <PainScale value={painWatch ?? 0} />
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
                      <div className="drawer-sticky-actions">
                        <Button type="primary" htmlType="submit" loading={loading} disabled={highRiskDiscomfort}>
                          提交打卡并动态调整
                        </Button>
                        <Link to="/user/prescriptions">
                          <Button>我的处方</Button>
                        </Link>
                      </div>
                    </Form>
                  </Drawer>
                </>
              ) : (
                <DataNote
                  title="当前没有可执行处方"
                  description="只有已发布且非 R3 的处方才能进入运动反馈。R2 等待专家发布，R3 只展示医学评估建议。"
                  action={
                    <Link to="/user/health-data">
                      <Button>完善建档资料</Button>
                    </Link>
                  }
                />
              )}
              </Space>
            </WorkbenchSection>
          </div>
        </Space>
    </AppShell>
  );
}
