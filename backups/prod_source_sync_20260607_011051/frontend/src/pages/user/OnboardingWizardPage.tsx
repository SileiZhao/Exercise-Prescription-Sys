import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space
} from "antd";
import { useEffect, useMemo, useState } from "react";
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
import { AppShell, FlowProgress, HealthDataWizard, MotionCard, UnitInput } from "../../components/ProductUI";

type StepId = "consent" | "profile" | "fitness" | "body" | "biochemical" | "risk";

const steps: Array<{ id: StepId; title: string }> = [
  { id: "consent", title: "知情同意" },
  { id: "profile", title: "基础信息" },
  { id: "fitness", title: "体质测试" },
  { id: "body", title: "身体成分" },
  { id: "biochemical", title: "生化指标" },
  { id: "risk", title: "风险问卷" }
];

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

  return (
    <AppShell role="user" title="用户建档向导">
      <div className="onboarding-content">
        <MotionCard className="onboarding-panel">
          <HealthDataWizard current={submitted ? 6 : current} />
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
              <Space className="onboarding-actions">
                <Button disabled={current === 0 || saving} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>
                  上一步
                </Button>
                <Button type="primary" htmlType="button" loading={saving} onClick={submitCurrentStep}>
                  保存并下一步
                </Button>
                <Link to="/user/dashboard">
                  <Button>返回用户端</Button>
                </Link>
              </Space>
            </Form>
          )}
        </MotionCard>
      </div>
    </AppShell>
  );
}

function ProfileFields() {
  return (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item {...field("name", "姓名")}>
          <Input placeholder="真实姓名或匿名编码" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("sex", "性别")}>
          <Select options={["男", "女", "其他", "未说明"].map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("birth_date", "出生日期")}>
          <Input type="date" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("height_cm", "身高")}>
          <UnitInput min={80} max={230} unit="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("weight_kg", "体重")}>
          <UnitInput min={20} max={250} unit="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("waist_cm", "腰围", false)}>
          <UnitInput min={40} max={180} unit="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("hip_cm", "臀围", false)}>
          <UnitInput min={50} max={200} unit="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("occupation_type", "职业类型", false)}>
          <Select
            allowClear
            options={["学生", "教师", "机关事业", "企业职工", "自由职业", "退休", "其他"].map((value) => ({
              value,
              label: value
            }))}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("sedentary_hours", "日均久坐时间", false)}>
          <UnitInput min={0} max={16} unit="小时/日" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("sleep_hours", "睡眠时长", false)}>
          <UnitInput min={0} max={14} unit="小时/日" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("exercise_goal", "运动目标")}>
          <Select mode="multiple" options={goalOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("exercise_habit", "当前运动习惯")}>
          <Select options={["无规律运动", "每周1-2次", "每周3-5次", "每周≥6次"].map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("exercise_experience", "运动经验")}>
          <Select options={["无", "初级", "中级", "高级", "运动员"].map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function FitnessFields() {
  return (
    <Row gutter={16}>
      <Col xs={24} md={8}>
        <Form.Item {...field("resting_hr", "静息心率")}>
          <UnitInput min={30} max={140} unit="次/分" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("sbp", "收缩压")}>
          <UnitInput min={70} max={250} unit="mmHg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("dbp", "舒张压")}>
          <UnitInput min={40} max={150} unit="mmHg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("vital_capacity", "肺活量", false)}>
          <UnitInput min={500} max={8000} unit="mL" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("grip_left", "握力-左", false)}>
          <UnitInput min={0} max={100} unit="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("grip_right", "握力-右", false)}>
          <UnitInput min={0} max={100} unit="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("sit_reach", "坐位体前屈", false)}>
          <UnitInput min={-30} max={40} unit="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("single_leg_stand", "闭眼单脚站立", false)}>
          <UnitInput min={0} max={300} unit="秒" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("pain_score", "疼痛评分")}>
          <UnitInput min={0} max={10} unit="分" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("rpe_baseline", "主观疲劳评分", false)}>
          <UnitInput min={0} max={20} unit="分" />
        </Form.Item>
      </Col>
    </Row>
  );
}

function BodyCompositionFields() {
  return (
    <Row gutter={16}>
      <Col xs={24} md={8}>
        <Form.Item {...field("body_fat_pct", "体脂率", false)}>
          <UnitInput min={3} max={60} unit="%" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("skeletal_muscle_kg", "骨骼肌量", false)}>
          <UnitInput min={5} max={80} unit="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("muscle_mass_kg", "肌肉量", false)}>
          <UnitInput min={5} max={120} unit="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("visceral_fat_level", "内脏脂肪等级", false)}>
          <UnitInput min={1} max={30} unit="级" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("bmr", "基础代谢率", false)}>
          <UnitInput min={600} max={3500} unit="kcal/日" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("device_model", "设备型号", false)}>
          <Input />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="is_fasting" valuePropName="checked">
          <Checkbox>空腹测量</Checkbox>
        </Form.Item>
      </Col>
    </Row>
  );
}

function BiochemicalFields() {
  return (
    <Row gutter={16}>
      {[
        ["fbg", "空腹血糖", "mmol/L"],
        ["pbg_2h", "餐后2小时血糖", "mmol/L"],
        ["hba1c", "糖化血红蛋白", "%"],
        ["tc", "总胆固醇", "mmol/L"],
        ["tg", "甘油三酯", "mmol/L"],
        ["hdl_c", "HDL-C", "mmol/L"],
        ["ldl_c", "LDL-C", "mmol/L"],
        ["uric_acid", "尿酸", "μmol/L"],
        ["spo2", "静息血氧", "%"]
      ].map(([name, label, unit]) => (
        <Col xs={24} md={8} key={name}>
          <Form.Item {...field(name, label, false)}>
            <UnitInput unit={unit} />
          </Form.Item>
        </Col>
      ))}
    </Row>
  );
}

function RiskFields() {
  return (
    <Row gutter={16}>
      {[
        ["has_hypertension", "是否有高血压"],
        ["has_diabetes", "是否有糖尿病"],
        ["has_chd", "是否有冠心病"],
        ["has_stroke", "是否有脑卒中史"],
        ["has_ckd", "是否有慢性肾病"],
        ["has_respiratory_disease", "是否有慢阻肺/哮喘"],
        ["has_joint_pain", "是否有关节疼痛"],
        ["recent_injury", "近期运动损伤"],
        ["chest_pain", "胸痛或胸闷"],
        ["syncope", "头晕或晕厥"],
        ["abnormal_dyspnea", "活动后异常气短"],
        ["palpitation", "心悸或心律不齐"]
      ].map(([name, label]) => (
        <Col xs={24} md={8} key={name}>
          <Form.Item name={name} valuePropName="checked">
            <Checkbox>{label}</Checkbox>
          </Form.Item>
        </Col>
      ))}
      <Col xs={24} md={12}>
        <Form.Item {...field("pain_location", "疼痛部位", false)}>
          <Select mode="multiple" options={painLocationOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("medication", "当前用药", false)}>
          <Select mode="multiple" options={medicationOptions.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("parq_result", "PAR-Q+问卷结果", false)}>
          <Select allowClear options={["阴性", "阳性", "不完整"].map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item {...field("doctor_restriction", "医生运动限制建议", false)}>
          <Input.TextArea rows={3} placeholder="无或填写医生明确限制内容" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item {...field("surgery_history", "手术史", false)}>
          <Input.TextArea rows={3} placeholder="无或填写部位和时间" />
        </Form.Item>
      </Col>
    </Row>
  );
}
