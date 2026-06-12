import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Select,
  Space,
  Typography
} from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";

import {
  acceptConsent,
  createBiochemicalIndex,
  createBodyComposition,
  createFitnessTest,
  createRiskScreening,
  upsertProfile,
  type HealthPayload
} from "../../api/healthData";
import {
  AppShell,
  ActionBar,
  ClinicalStatusBadge,
  DataNote,
  DecisionBanner,
  FlowProgress,
  ProcessRail,
  UnitInput,
  WorkbenchSection
} from "../../components/ProductUI";

type StepId = "consent" | "profile" | "fitness" | "body" | "biochemical" | "risk";

const steps: Array<{ id: StepId; title: string }> = [
  { id: "consent", title: "知情同意" },
  { id: "profile", title: "基础信息" },
  { id: "fitness", title: "体质测试" },
  { id: "body", title: "身体成分" },
  { id: "biochemical", title: "生化指标" },
  { id: "risk", title: "风险问卷" }
];

const stepDescriptions: Record<StepId, string> = {
  consent: "确认平台边界",
  profile: "身份、体型、目标",
  fitness: "血压、心率、疼痛",
  body: "体成分和设备来源",
  biochemical: "血糖、血脂等",
  risk: "疾病史和红旗信号"
};

const stepFocus: Record<StepId, { objective: string; required: string; exit: string; risk: string }> = {
  consent: {
    objective: "确认平台不是医疗诊断系统，并允许采集运动健康数据。",
    required: "勾选知情同意。",
    exit: "保存同意记录后进入基础信息。",
    risk: "已有胸痛、晕厥、严重气短等信号时，不应继续普通训练流程。"
  },
  profile: {
    objective: "建立年龄、BMI、运动目标和基础活动水平。",
    required: "姓名、性别、出生日期、身高、体重、运动目标、习惯和经验。",
    exit: "基础信息通过校验后进入体质测试。",
    risk: "年龄、身高、体重异常会阻断提交，避免错误分级。"
  },
  fitness: {
    objective: "确认运动前生命体征和疼痛起点。",
    required: "静息心率、血压和疼痛评分。",
    exit: "保存后进入体成分增强项。",
    risk: "血压、疼痛和心率异常会影响 R2/R3 判定。"
  },
  body: {
    objective: "补充体脂、肌肉量和设备来源，提高模板匹配质量。",
    required: "可跳过，没有设备数据时不阻断。",
    exit: "保存或跳过后进入生化指标。",
    risk: "缺失体成分时系统会采用更保守的处方解释。"
  },
  biochemical: {
    objective: "补充血糖、血脂、尿酸和血氧等代谢指标。",
    required: "可跳过，没有检验数据时不阻断。",
    exit: "保存或跳过后进入风险问卷。",
    risk: "血糖血脂异常会改变慢病模板和反馈提醒。"
  },
  risk: {
    objective: "确认慢病史、红旗症状、医生限制和用药信息。",
    required: "慢病风险和红旗信号必须按真实情况选择。",
    exit: "提交后进入风险结果，决定处方是否可见。",
    risk: "任一红旗信号可能触发 R3 医学评估建议。"
  }
};

const goalOptions = [
  "减脂",
  "降血压",
  "控糖",
  "增强心肺",
  "增肌",
  "改善柔韧",
  "改善平衡",
  "康复恢复",
  "体质提升"
];

const painLocationOptions = ["颈", "肩", "腰", "髋", "膝", "踝", "足", "其他"];
const medicationOptions = ["降压药", "降糖药", "抗凝药", "β受体阻滞剂", "止痛药", "其他"];
const consentText =
  "本平台提供运动健康指导、风险提示、运动处方建议和运动干预跟踪服务，不替代医疗诊断、药物治疗和临床处置。平台将采集六类运动健康数据用于风险筛查、处方生成、专家审核、反馈调整和阶段评估。";
const draftStorageKey = "exercise-health-data-draft";
const defaultFormValues: HealthPayload = {
  sex: "男",
  exercise_goal: ["体质提升"],
  exercise_habit: "无规律运动",
  exercise_experience: "初级",
  source: "manual",
  has_hypertension: false,
  has_diabetes: false,
  has_chd: false,
  has_stroke: false,
  has_ckd: false,
  has_respiratory_disease: false,
  has_joint_pain: false,
  recent_injury: false,
  chest_pain: false,
  syncope: false,
  abnormal_dyspnea: false,
  palpitation: false,
  medication: [],
  pain_location: []
};
const profileSchema = z.object({
  name: z.string().min(1, "请填写姓名"),
  sex: z.string().min(1, "请选择性别"),
  birth_date: z.string().min(1, "请填写出生日期"),
  height_cm: z.coerce.number().min(80, "身高需在80-230 cm之间").max(230, "身高需在80-230 cm之间"),
  weight_kg: z.coerce.number().min(20, "体重需在20-250 kg之间").max(250, "体重需在20-250 kg之间"),
  waist_cm: z.coerce.number().min(40, "腰围需在40-180 cm之间").max(180, "腰围需在40-180 cm之间").optional(),
  hip_cm: z.coerce.number().min(50, "臀围需在50-200 cm之间").max(200, "臀围需在50-200 cm之间").optional(),
  occupation_type: z.string().optional(),
  sedentary_hours: z.coerce.number().min(0, "日均久坐时间需在0-16小时之间").max(16, "日均久坐时间需在0-16小时之间").optional(),
  sleep_hours: z.coerce.number().min(0, "睡眠时长需在0-14小时之间").max(14, "睡眠时长需在0-14小时之间").optional(),
  exercise_goal: z.array(z.string()).min(1, "请选择运动目标"),
  exercise_habit: z.string().min(1, "请选择当前运动习惯"),
  exercise_experience: z.string().min(1, "请选择运动经验")
});

function field(value: string, label: string, required = true) {
  return {
    name: value,
    label,
    rules: required ? [{ required: true, message: `请填写${label}` }] : undefined
  };
}

function FieldGroup({
  title,
  description,
  marker,
  tone = "default",
  children
}: {
  title: string;
  description: string;
  marker: string;
  tone?: "default" | "required" | "optional" | "danger";
  children: ReactNode;
}) {
  return (
    <section className={`clinical-field-group field-group-${tone}`}>
      <div className="field-group-head">
        <span className="field-group-marker">{marker}</span>
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
      </div>
      <div className="clinical-field-grid">{children}</div>
    </section>
  );
}

function filterPayload(values: HealthPayload): HealthPayload {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function loadDraft(): Record<string, HealthPayload> {
  try {
    const raw = localStorage.getItem(draftStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(stepId: StepId, values: HealthPayload) {
  const draft = loadDraft();
  draft[stepId] = filterPayload(values);
  localStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function profileValidationError(values: HealthPayload) {
  const parsed = profileSchema.safeParse(filterPayload(values));
  return parsed.success ? null : parsed.error.issues[0]?.message ?? "请修正基础信息中的异常取值后再提交。";
}

export function OnboardingWizardPage() {
  const [current, setCurrent] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form] = Form.useForm();
  const step = steps[current];
  const focus = stepFocus[step.id];
  const completedStepCount = submitted ? steps.length : current;
  const canSkipOptionalStep = step.id === "body" || step.id === "biochemical";
  const initialValues = useMemo(() => ({ ...defaultFormValues, ...(loadDraft()[step.id] ?? {}) }), [step.id]);

  useEffect(() => {
    if (step.id === "consent") return;
    form.setFieldsValue({ ...defaultFormValues, ...(loadDraft()[step.id] ?? {}) });
  }, [form, step.id]);

  const saveStep = async (values: HealthPayload) => {
    if (step.id === "consent") {
      setSaving(true);
      setNotice(null);
      try {
        await acceptConsent({
          consent_version: "2026-v1",
          consent_text: consentText
        });
        setCurrent(1);
        setNotice("已记录知情同意，请继续填写基础信息。");
      } catch {
        setNotice("保存失败，请检查网络或登录状态后重试。");
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setNotice(null);
    setValidationMessage(null);
    try {
      const payload = filterPayload({ ...(loadDraft()[step.id] ?? {}), ...values });
      if (step.id === "profile") {
        const message = profileValidationError(payload);
        if (message) {
          setValidationMessage(message);
          setNotice("请修正基础信息中的异常取值后再提交。");
          return;
        }
      }
      if (step.id === "profile") {
        await upsertProfile(payload);
      }
      if (step.id === "fitness") {
        await createFitnessTest(payload);
      }
      if (step.id === "body") {
        await createBodyComposition(payload);
      }
      if (step.id === "biochemical") {
        await createBiochemicalIndex(payload);
      }
      if (step.id === "risk") {
        await createRiskScreening(payload);
      }

      const next = Math.min(current + 1, steps.length - 1);
      setCurrent(next);
      form.resetFields();
      setSubmitted(step.id === "risk");
      setNotice(step.id === "risk" ? "六类数据已提交，可继续生成风险结果。" : "已保存，进入下一步。");
    } catch {
      setNotice("保存失败，请检查网络或字段取值后重试。");
    } finally {
      setSaving(false);
    }
  };

  const showFormValidationFallback = () => {
    if (step.id !== "profile") {
      setValidationMessage("请补充当前步骤必填字段后再提交。");
      return;
    }
    const values = { ...(loadDraft()[step.id] ?? {}), ...form.getFieldsValue(true) };
    setValidationMessage(profileValidationError(values) ?? "请补充当前步骤必填字段后再提交。");
  };

  const submitCurrentStep = async () => {
    setValidationMessage(null);
    const draftValues = { ...(loadDraft()[step.id] ?? {}), ...form.getFieldsValue(true) };
    if (step.id === "profile") {
      const message = profileValidationError(draftValues);
      if (message) {
        setNotice("请修正基础信息中的异常取值后再提交。");
        setValidationMessage(message);
        return;
      }
    }
    try {
      const values = await form.validateFields();
      await saveStep({ ...draftValues, ...values });
    } catch {
      showFormValidationFallback();
    }
  };

  const saveCurrentDraftOnly = () => {
    if (step.id === "consent") {
      return;
    }
    saveDraft(step.id, { ...(loadDraft()[step.id] ?? {}), ...form.getFieldsValue(true) });
    setNotice("草稿已保存在本机，稍后可继续当前步骤。");
  };

  const skipOptionalStep = () => {
    if (!canSkipOptionalStep) {
      return;
    }
    saveDraft(step.id, { ...(loadDraft()[step.id] ?? {}), ...form.getFieldsValue(true) });
    setCurrent((value) => Math.min(value + 1, steps.length - 1));
    setNotice("已跳过当前可选增强项，后续仍可返回补充。");
  };

  return (
    <AppShell
      role="user"
      title="用户建档"
      subtitle="按临床风险筛查顺序完成六类数据，先保存安全边界再生成处方"
      statusItems={
        <>
          <ClinicalStatusBadge type="readiness" value={submitted ? "ready" : "degraded"} label={submitted ? "建档已提交" : `当前：${step.title}`} />
          <ClinicalStatusBadge type="risk" value="unknown" label="风险待生成" />
        </>
      }
    >
      <Space direction="vertical" size={16} className="onboarding-section">
        <DecisionBanner
          tone={submitted ? "safe" : step.id === "risk" ? "warning" : "info"}
          title={submitted ? "六类数据已提交，可以进入风险评估" : `当前步骤：${step.title}`}
          description={
            submitted
              ? "下一步生成风险分型，系统会按 R0/R1/R2/R3 决定是否自动生成处方、进入专家审核或仅显示医学评估建议。"
              : "请按顺序保存当前步骤。红旗症状、医生限制、血压血糖异常等字段会直接影响训练入口是否开放。"
          }
          meta={
            <>
              <ClinicalStatusBadge type="readiness" value={consentChecked || current > 0 ? "ready" : "degraded"} label="知情同意" />
              <ClinicalStatusBadge type="review" value={submitted ? "approved" : "pending"} label={`${submitted ? 6 : current} / 6 已完成`} />
            </>
          }
          actions={
            submitted ? (
              <Link to="/user/risk-result">
                <Button type="primary">生成风险结果</Button>
              </Link>
            ) : null
          }
        />
        {!submitted ? (
          <div className="mobile-step-action-inline" aria-label="当前建档步骤操作">
            <div>
              <Typography.Text strong>{step.title}</Typography.Text>
              <Typography.Paragraph type="secondary">{focus.exit}</Typography.Paragraph>
            </div>
            {step.id === "consent" ? (
              <Button type="primary" disabled={!consentChecked} loading={saving} onClick={() => saveStep({})}>
                保存当前步骤
              </Button>
            ) : (
              <Button type="primary" loading={saving} onClick={submitCurrentStep}>
                保存当前步骤
              </Button>
            )}
          </div>
        ) : null}
        <nav className="wizard-step-grid" aria-label="建档步骤">
          {steps.map((item, index) => {
            const isCurrent = index === current && !submitted;
            const isComplete = submitted || index < current;
            const isReachable = submitted || index <= current;
            return (
              <button
                key={item.id}
                type="button"
                className={`wizard-step-card${isCurrent ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
                disabled={!isReachable}
                onClick={() => setCurrent(index)}
              >
                <span className="wizard-step-index">{index + 1}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{stepDescriptions[item.id]}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="form-workbench-grid onboarding-content">
          <WorkbenchSection
            title={`当前填写：${step.title}`}
            description={`已完成 ${completedStepCount} / ${steps.length} 步。每次只提交当前数据域，避免一次性堆叠全部字段。`}
          >
          {!submitted ? (
            <section className="step-focus-panel" aria-label="当前步骤焦点">
              <div>
                <Typography.Text type="secondary">当前目标</Typography.Text>
                <Typography.Title level={4}>{focus.objective}</Typography.Title>
              </div>
              <dl className="step-focus-lines">
                <div>
                  <dt>必填范围</dt>
                  <dd>{focus.required}</dd>
                </div>
                <div className={step.id === "risk" ? "is-danger" : undefined}>
                  <dt>安全影响</dt>
                  <dd>{focus.risk}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {notice ? (
            <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon />
          ) : null}
          {validationMessage ? <Alert className="form-alert" type="error" message={validationMessage} showIcon /> : null}
          {submitted ? (
            <Card size="small" title="风险评估流程" className="form-alert">
              <FlowProgress current={4} />
            </Card>
          ) : null}
          {step.id === "consent" ? (
            <Space direction="vertical" size={20} className="onboarding-section">
              <Alert
                type="warning"
                showIcon
                message={`${consentText}若存在胸痛、晕厥、严重气短、血压显著异常、急性损伤或医生明确限制运动，请先进行医学评估。`}
              />
              <Checkbox checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)}>
                我已阅读并同意平台采集六类运动健康数据用于风险筛查、处方生成、专家审核和反馈调整。
              </Checkbox>
              <Button type="primary" disabled={!consentChecked} loading={saving} onClick={() => saveStep({})}>
                保存并下一步
              </Button>
            </Space>
          ) : (
            <Form
              form={form}
              layout="vertical"
              className="onboarding-form"
              onFinish={(values: HealthPayload) => saveStep(values)}
              onFinishFailed={showFormValidationFallback}
              initialValues={initialValues}
              onValuesChange={(_, values) => {
                setValidationMessage(null);
                saveDraft(step.id, values);
              }}
            >
              {step.id === "profile" ? <ProfileFields /> : null}
              {step.id === "fitness" ? <FitnessFields /> : null}
              {step.id === "body" ? <BodyCompositionFields /> : null}
              {step.id === "biochemical" ? <BiochemicalFields /> : null}
              {step.id === "risk" ? <RiskFields /> : null}
              <ActionBar
                className="onboarding-actions"
                secondary={
                  <>
                    <Button disabled={current === 0 || saving} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>
                      上一步
                    </Button>
                    <Button disabled={saving} onClick={saveCurrentDraftOnly}>
                      保存草稿
                    </Button>
                  </>
                }
                more={
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        {
                          key: "skip",
                          label: "跳过当前可选项",
                          disabled: !canSkipOptionalStep || saving
                        },
                        {
                          key: "dashboard",
                          label: <Link to="/user/dashboard">返回用户端</Link>
                        }
                      ],
                      onClick: ({ key }) => {
                        if (key === "skip") {
                          skipOptionalStep();
                        }
                      }
                    }}
                  >
                    <Button aria-label="更多建档操作">更多操作</Button>
                  </Dropdown>
                }
                primary={
                  <Button type="primary" htmlType="button" loading={saving} onClick={submitCurrentStep}>
                    保存并继续
                  </Button>
                }
              />
            </Form>
          )}
          </WorkbenchSection>
          <aside className="workbench-side-rail" aria-label="建档说明">
            <ProcessRail
              title="采集顺序"
              description="前一步通过后再进入下一步，避免把六类数据混在一起。"
              steps={steps.map((item, index) => ({
                title: item.title,
                description: stepDescriptions[item.id],
                status: submitted || index < current ? "done" : index === current ? "active" : "pending"
              }))}
            />
            <DataNote
              title="为什么不一次性展示所有字段"
              description="这套流程面向试点建档和复评，按数据域分步提交可以让错误定位更清楚，也能在网络失败时保留当前步骤草稿。"
            />
          </aside>
        </div>
      </Space>
    </AppShell>
  );
}

function ProfileFields() {
  return (
    <div className="clinical-form-groups">
      <FieldGroup
        marker="必填"
        tone="required"
        title="最小建档信息"
        description="这些字段用于年龄、BMI 和基础风险边界，缺失时不能生成风险结果。"
      >
        <Form.Item {...field("name", "姓名")}>
          <Input placeholder="真实姓名或匿名编码" />
        </Form.Item>
        <Form.Item {...field("sex", "性别")}>
          <Select options={["男", "女", "其他", "未说明"].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("birth_date", "出生日期")}>
          <Input type="date" />
        </Form.Item>
        <Form.Item {...field("height_cm", "身高")}>
          <UnitInput min={80} max={230} unit="cm" />
        </Form.Item>
        <Form.Item {...field("weight_kg", "体重")}>
          <UnitInput min={20} max={250} unit="kg" />
        </Form.Item>
      </FieldGroup>

      <FieldGroup
        marker="增强"
        tone="optional"
        title="体型与生活方式"
        description="这些数据提升模板匹配质量，不影响当前步骤保存。"
      >
        <Form.Item {...field("waist_cm", "腰围", false)}>
          <UnitInput min={40} max={180} unit="cm" />
        </Form.Item>
        <Form.Item {...field("hip_cm", "臀围", false)}>
          <UnitInput min={50} max={200} unit="cm" />
        </Form.Item>
        <Form.Item {...field("occupation_type", "职业类型", false)}>
          <Select
            allowClear
            options={["学生", "教师", "机关事业", "企业职工", "自由职业", "退休", "其他"].map((value) => ({
              value,
              label: value
            }))}
          />
        </Form.Item>
        <Form.Item {...field("sedentary_hours", "日均久坐时间", false)}>
          <UnitInput min={0} max={16} unit="小时/日" />
        </Form.Item>
        <Form.Item {...field("sleep_hours", "睡眠时长", false)}>
          <UnitInput min={0} max={14} unit="小时/日" />
        </Form.Item>
      </FieldGroup>

      <FieldGroup
        marker="目标"
        title="运动目标与经验"
        description="用于决定处方模板、起始强度和解释口径。"
      >
        <Form.Item {...field("exercise_goal", "运动目标")}>
          <Select mode="multiple" options={goalOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("exercise_habit", "当前运动习惯")}>
          <Select options={["无规律运动", "每周1-2次", "每周3-5次", "每周≥6次"].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("exercise_experience", "运动经验")}>
          <Select options={["无", "初级", "中级", "高级", "运动员"].map((value) => ({ value, label: value }))} />
        </Form.Item>
      </FieldGroup>
    </div>
  );
}

function FitnessFields() {
  return (
    <div className="clinical-form-groups">
      <FieldGroup
        marker="安全"
        tone="required"
        title="运动前生命体征"
        description="血压、心率和疼痛评分会直接影响 R2/R3 分级和当日运动入口。"
      >
        <Form.Item {...field("resting_hr", "静息心率")}>
          <UnitInput min={30} max={140} unit="次/分" />
        </Form.Item>
        <Form.Item {...field("sbp", "收缩压")}>
          <UnitInput min={70} max={250} unit="mmHg" />
        </Form.Item>
        <Form.Item {...field("dbp", "舒张压")}>
          <UnitInput min={40} max={150} unit="mmHg" />
        </Form.Item>
        <Form.Item {...field("pain_score", "疼痛评分")}>
          <UnitInput min={0} max={10} unit="分" />
        </Form.Item>
      </FieldGroup>

      <FieldGroup
        marker="体测"
        tone="optional"
        title="体质测试增强项"
        description="用于处方强度和动作库匹配，缺失时系统会采用更保守的起始模板。"
      >
        <Form.Item {...field("vital_capacity", "肺活量", false)}>
          <UnitInput min={500} max={8000} unit="mL" />
        </Form.Item>
        <Form.Item {...field("grip_left", "握力-左", false)}>
          <UnitInput min={0} max={100} unit="kg" />
        </Form.Item>
        <Form.Item {...field("grip_right", "握力-右", false)}>
          <UnitInput min={0} max={100} unit="kg" />
        </Form.Item>
        <Form.Item {...field("sit_reach", "坐位体前屈", false)}>
          <UnitInput min={-30} max={40} unit="cm" />
        </Form.Item>
        <Form.Item {...field("single_leg_stand", "闭眼单脚站立", false)}>
          <UnitInput min={0} max={300} unit="秒" />
        </Form.Item>
        <Form.Item {...field("rpe_baseline", "主观疲劳评分", false)}>
          <UnitInput min={0} max={20} unit="分" />
        </Form.Item>
      </FieldGroup>
    </div>
  );
}

function BodyCompositionFields() {
  return (
    <div className="clinical-form-groups">
      <FieldGroup
        marker="可选"
        tone="optional"
        title="体成分指标"
        description="没有设备数据时可以跳过；有数据时会提高减脂、增肌和代谢风险模板匹配精度。"
      >
        <Form.Item {...field("body_fat_pct", "体脂率", false)}>
          <UnitInput min={3} max={60} unit="%" />
        </Form.Item>
        <Form.Item {...field("skeletal_muscle_kg", "骨骼肌量", false)}>
          <UnitInput min={5} max={80} unit="kg" />
        </Form.Item>
        <Form.Item {...field("muscle_mass_kg", "肌肉量", false)}>
          <UnitInput min={5} max={120} unit="kg" />
        </Form.Item>
        <Form.Item {...field("visceral_fat_level", "内脏脂肪等级", false)}>
          <UnitInput min={1} max={30} unit="级" />
        </Form.Item>
        <Form.Item {...field("bmr", "基础代谢率", false)}>
          <UnitInput min={600} max={3500} unit="kcal/日" />
        </Form.Item>
      </FieldGroup>

      <FieldGroup
        marker="来源"
        title="测量来源"
        description="设备和测量状态用于解释数据可信度，不作为必填阻断项。"
      >
        <Form.Item {...field("device_model", "设备型号", false)}>
          <Input placeholder="例如 InBody / 华为 / 手工录入" />
        </Form.Item>
        <Form.Item name="is_fasting" valuePropName="checked" className="checkbox-field-card">
          <Checkbox>空腹测量</Checkbox>
        </Form.Item>
      </FieldGroup>
    </div>
  );
}

function BiochemicalFields() {
  return (
    <div className="clinical-form-groups">
      <FieldGroup
        marker="血糖"
        tone="optional"
        title="糖代谢指标"
        description="用于识别控糖、餐后运动和低血糖风险，缺失时按问卷与基础资料保守处理。"
      >
        {[
          ["fbg", "空腹血糖", "mmol/L"],
          ["pbg_2h", "餐后2小时血糖", "mmol/L"],
          ["hba1c", "糖化血红蛋白", "%"]
        ].map(([name, label, unit]) => (
          <Form.Item {...field(name, label, false)} key={name}>
            <UnitInput unit={unit} />
          </Form.Item>
        ))}
      </FieldGroup>

      <FieldGroup
        marker="血脂"
        tone="optional"
        title="血脂与代谢风险"
        description="用于匹配慢病风险管理模板和阶段复评指标。"
      >
        {[
          ["tc", "总胆固醇", "mmol/L"],
          ["tg", "甘油三酯", "mmol/L"],
          ["hdl_c", "HDL-C", "mmol/L"],
          ["ldl_c", "LDL-C", "mmol/L"]
        ].map(([name, label, unit]) => (
          <Form.Item {...field(name, label, false)} key={name}>
            <UnitInput unit={unit} />
          </Form.Item>
        ))}
      </FieldGroup>

      <FieldGroup
        marker="补充"
        title="其他安全参考"
        description="尿酸和血氧可作为个性化限制条件，非必须。"
      >
        {[
          ["uric_acid", "尿酸", "μmol/L"],
          ["spo2", "静息血氧", "%"]
        ].map(([name, label, unit]) => (
          <Form.Item {...field(name, label, false)} key={name}>
            <UnitInput unit={unit} />
          </Form.Item>
        ))}
      </FieldGroup>
    </div>
  );
}

function RiskFields() {
  return (
    <div className="clinical-form-groups">
      <FieldGroup
        marker="病史"
        title="慢病与关节风险"
        description="用于决定起始强度、动作禁忌和是否需要专家复核。"
      >
        <div className="clinical-checkbox-grid">
          {[
            ["has_hypertension", "是否有高血压"],
            ["has_diabetes", "是否有糖尿病"],
            ["has_chd", "是否有冠心病"],
            ["has_stroke", "是否有脑卒中史"],
            ["has_ckd", "是否有慢性肾病"],
            ["has_respiratory_disease", "是否有慢阻肺/哮喘"],
            ["has_joint_pain", "是否有关节疼痛"],
            ["recent_injury", "近期运动损伤"]
          ].map(([name, label]) => (
            <Form.Item name={name} valuePropName="checked" key={name} className="checkbox-field-card">
              <Checkbox>{label}</Checkbox>
            </Form.Item>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup
        marker="红旗"
        tone="danger"
        title="必须优先确认的停止信号"
        description="任一项为是都可能触发 R3 或强制医学评估，系统不会直接展示训练处方。"
      >
        <div className="clinical-checkbox-grid">
          {[
            ["chest_pain", "胸痛或胸闷"],
            ["syncope", "头晕或晕厥"],
            ["abnormal_dyspnea", "活动后异常气短"],
            ["palpitation", "心悸或心律不齐"]
          ].map(([name, label]) => (
            <Form.Item name={name} valuePropName="checked" key={name} className="checkbox-field-card">
              <Checkbox>{label}</Checkbox>
            </Form.Item>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup
        marker="补充"
        title="疼痛、用药和医生限制"
        description="用于细化动作禁忌、强度上限和处方解释。"
      >
        <Form.Item {...field("pain_location", "疼痛部位", false)}>
          <Select mode="multiple" options={painLocationOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("medication", "当前用药", false)}>
          <Select mode="multiple" options={medicationOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("parq_result", "PAR-Q+问卷结果", false)}>
          <Select allowClear options={["阴性", "阳性", "不完整"].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item {...field("doctor_restriction", "医生运动限制建议", false)} className="clinical-field-wide">
          <Input.TextArea rows={3} placeholder="无或填写医生明确限制内容" />
        </Form.Item>
        <Form.Item {...field("surgery_history", "手术史", false)} className="clinical-field-wide">
          <Input.TextArea rows={3} placeholder="无或填写部位和时间" />
        </Form.Item>
      </FieldGroup>
    </div>
  );
}
