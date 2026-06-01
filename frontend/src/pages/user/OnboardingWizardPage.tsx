import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Select,
  Space,
  Steps,
  Typography
} from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  acceptConsent,
  createBiochemicalIndex,
  createBodyComposition,
  createFitnessTest,
  createRiskScreening,
  upsertProfile,
  type HealthPayload
} from "../../api/healthData";

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

export function OnboardingWizardPage() {
  const [current, setCurrent] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form] = Form.useForm();
  const step = steps[current];

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
    try {
      const payload = filterPayload(values);
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
      setNotice(step.id === "risk" ? "六类数据已提交，可继续生成风险结果。" : "已保存，进入下一步。");
    } catch {
      setNotice("保存失败，请检查网络或字段取值后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          用户建档向导
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content onboarding-content">
        <Card className="onboarding-panel">
          <Steps
            current={current}
            className="onboarding-steps"
            items={steps.map((item) => ({ title: item.title }))}
          />
          {notice ? (
            <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} message={notice} showIcon />
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
              initialValues={{
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
                <Button type="primary" htmlType="submit" loading={saving}>
                  保存并下一步
                </Button>
                <Link to="/user/dashboard">
                  <Button>返回用户端</Button>
                </Link>
              </Space>
            </Form>
          )}
        </Card>
      </Layout.Content>
    </Layout>
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
          <InputNumber min={80} max={230} addonAfter="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("weight_kg", "体重")}>
          <InputNumber min={20} max={250} addonAfter="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("waist_cm", "腰围", false)}>
          <InputNumber min={40} max={180} addonAfter="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("hip_cm", "臀围", false)}>
          <InputNumber min={50} max={200} addonAfter="cm" />
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
          <InputNumber min={0} max={16} addonAfter="小时/日" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item {...field("sleep_hours", "睡眠时长", false)}>
          <InputNumber min={0} max={14} addonAfter="小时/日" />
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
          <InputNumber min={30} max={140} addonAfter="次/分" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("sbp", "收缩压")}>
          <InputNumber min={70} max={250} addonAfter="mmHg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("dbp", "舒张压")}>
          <InputNumber min={40} max={150} addonAfter="mmHg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("vital_capacity", "肺活量", false)}>
          <InputNumber min={500} max={8000} addonAfter="mL" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("grip_left", "握力-左", false)}>
          <InputNumber min={0} max={100} addonAfter="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("grip_right", "握力-右", false)}>
          <InputNumber min={0} max={100} addonAfter="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("sit_reach", "坐位体前屈", false)}>
          <InputNumber min={-30} max={40} addonAfter="cm" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("single_leg_stand", "闭眼单脚站立", false)}>
          <InputNumber min={0} max={300} addonAfter="秒" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("pain_score", "疼痛评分")}>
          <InputNumber min={0} max={10} addonAfter="分" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("rpe_baseline", "主观疲劳评分", false)}>
          <InputNumber min={0} max={20} addonAfter="分" />
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
          <InputNumber min={3} max={60} addonAfter="%" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("skeletal_muscle_kg", "骨骼肌量", false)}>
          <InputNumber min={5} max={80} addonAfter="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("muscle_mass_kg", "肌肉量", false)}>
          <InputNumber min={5} max={120} addonAfter="kg" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("visceral_fat_level", "内脏脂肪等级", false)}>
          <InputNumber min={1} max={30} addonAfter="级" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item {...field("bmr", "基础代谢率", false)}>
          <InputNumber min={600} max={3500} addonAfter="kcal/日" />
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
            <InputNumber addonAfter={unit} />
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
