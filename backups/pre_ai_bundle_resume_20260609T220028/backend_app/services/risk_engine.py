from dataclasses import dataclass
from typing import Any, Literal

from app.schemas.risk import MatchedRiskRule, RiskEvaluationResult

Severity = Literal["GREEN", "YELLOW", "RED"]


@dataclass(frozen=True)
class RuleCondition:
    path: str
    op: str
    value: Any = None


@dataclass(frozen=True)
class RiskRule:
    code: str
    severity: Severity
    message: str
    condition: RuleCondition
    contraindications: tuple[str, ...] = ()


def _get_path(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _is_restriction(value: Any) -> bool:
    if value is None:
        return False
    if not isinstance(value, str):
        return bool(value)
    normalized = value.strip().lower()
    return normalized not in {"", "无", "没有", "否", "none", "no"}


def _evaluate_condition(snapshot: dict[str, Any], condition: RuleCondition) -> bool:
    actual = _get_path(snapshot, condition.path)
    if condition.op == "eq":
        return actual == condition.value
    if condition.op == "neq":
        return actual != condition.value
    if condition.op == "gt":
        return actual is not None and actual > condition.value
    if condition.op == "gte":
        return actual is not None and actual >= condition.value
    if condition.op == "lt":
        return actual is not None and actual < condition.value
    if condition.op == "lte":
        return actual is not None and actual <= condition.value
    if condition.op == "between":
        if actual is None:
            return False
        lower, upper = condition.value
        return lower <= actual <= upper
    if condition.op == "in_any":
        if not actual:
            return False
        if isinstance(actual, str):
            return any(str(item).lower() in actual.lower() for item in condition.value)
        return any(item in actual for item in condition.value)
    if condition.op == "contains":
        if actual is None:
            return False
        if isinstance(actual, list):
            return condition.value in actual
        return str(condition.value).lower() in str(actual).lower()
    if condition.op == "not_empty_restriction":
        return _is_restriction(actual)
    if condition.op == "exists":
        return actual is not None
    return False


BUILTIN_RULES: tuple[RiskRule, ...] = (
    RiskRule(
        code="RED_CHEST_PAIN",
        severity="RED",
        message="近期出现胸痛、胸闷或心前区不适，建议医学评估后再运动。",
        condition=RuleCondition("risk_screening.chest_pain", "eq", True),
        contraindications=("禁止生成运动训练方案",),
    ),
    RiskRule(
        code="RED_SYNCOPE",
        severity="RED",
        message="近期出现晕厥、黑蒙或原因不明头晕，建议医学评估。",
        condition=RuleCondition("risk_screening.syncope", "eq", True),
        contraindications=("禁止生成训练方案",),
    ),
    RiskRule(
        code="RED_DYSPNEA",
        severity="RED",
        message="轻微活动即严重气短或喘憋，建议医学评估。",
        condition=RuleCondition("risk_screening.abnormal_dyspnea", "eq", True),
        contraindications=("禁止推荐有氧训练",),
    ),
    RiskRule(
        code="RED_SEVERE_BLOOD_PRESSURE",
        severity="RED",
        message="静息血压达到红色风险阈值，建议医学评估后再运动。",
        condition=RuleCondition("fitness_test.sbp", "gte", 180),
        contraindications=("禁止生成训练方案",),
    ),
    RiskRule(
        code="RED_SEVERE_DIASTOLIC_PRESSURE",
        severity="RED",
        message="静息舒张压达到红色风险阈值，建议医学评估后再运动。",
        condition=RuleCondition("fitness_test.dbp", "gte", 110),
        contraindications=("禁止生成训练方案",),
    ),
    RiskRule(
        code="RED_SEVERE_PAIN",
        severity="RED",
        message="疼痛评分达到 7 分及以上，建议暂停相关训练并评估。",
        condition=RuleCondition("fitness_test.pain_score", "gte", 7),
        contraindications=("禁止推荐负荷刺激动作",),
    ),
    RiskRule(
        code="RED_DOCTOR_RESTRICTION",
        severity="RED",
        message="存在医生明确运动限制，平台按医生意见暂缓训练处方。",
        condition=RuleCondition("risk_screening.doctor_restriction", "not_empty_restriction"),
        contraindications=("禁止生成与医生限制相冲突内容",),
    ),
    RiskRule(
        code="RED_RECENT_INJURY",
        severity="RED",
        message="存在近期急性损伤风险，建议康复或医学评估。",
        condition=RuleCondition("risk_screening.recent_injury", "eq", True),
        contraindications=("禁止推荐相关部位训练",),
    ),
    RiskRule(
        code="YELLOW_HYPERTENSION",
        severity="YELLOW",
        message="已知高血压或血压偏高，需生成谨慎型处方并进入专家审核。",
        condition=RuleCondition("risk_screening.has_hypertension", "eq", True),
        contraindications=("避免憋气和大负荷力量训练",),
    ),
    RiskRule(
        code="YELLOW_DIABETES",
        severity="YELLOW",
        message="存在糖尿病或糖代谢异常风险，需提示血糖监测并专家审核。",
        condition=RuleCondition("risk_screening.has_diabetes", "eq", True),
        contraindications=("避免空腹大强度运动",),
    ),
    RiskRule(
        code="YELLOW_PAIN_4_6",
        severity="YELLOW",
        message="疼痛评分 4-6 分，需要限制相关动作并进入专家审核。",
        condition=RuleCondition("fitness_test.pain_score", "between", (4, 6)),
        contraindications=("避免跳跃、长跑、深蹲大负荷和疼痛诱发动作",),
    ),
    RiskRule(
        code="YELLOW_MEDICATION",
        severity="YELLOW",
        message="当前用药可能影响运动反应，需要专家审核并增加 RPE 监测。",
        condition=RuleCondition(
            "risk_screening.medication",
            "in_any",
            ("β受体阻滞剂", "胰岛素", "降糖药", "抗凝药"),
        ),
        contraindications=("不单纯依赖心率控制强度",),
    ),
    RiskRule(
        code="YELLOW_HIGH_BLOOD_PRESSURE",
        severity="YELLOW",
        message="当前血压达到黄色风险阈值，不建议直接进行中高强度运动。",
        condition=RuleCondition("fitness_test.sbp", "gte", 160),
        contraindications=("避免中高强度训练",),
    ),
    RiskRule(
        code="LOW_BMI_OR_SEDENTARY",
        severity="GREEN",
        message="存在超重、肥胖或久坐风险，建议生成低风险改善型处方。",
        condition=RuleCondition("profile.bmi", "gte", 24),
        contraindications=("避免初期直接高冲击训练",),
    ),
)


class RiskEngine:
    def __init__(self, rules: tuple[RiskRule, ...] = BUILTIN_RULES):
        self.rules = rules

    def evaluate(self, snapshot: dict[str, Any]) -> RiskEvaluationResult:
        matched = [rule for rule in self.rules if _evaluate_condition(snapshot, rule.condition)]
        matched_rules = [
            MatchedRiskRule(
                code=rule.code,
                severity=rule.severity,
                message=rule.message,
                path=rule.condition.path,
            )
            for rule in matched
        ]
        contraindications = sorted({item for rule in matched for item in rule.contraindications})

        if any(rule.severity == "RED" for rule in matched):
            return RiskEvaluationResult(
                risk_level="R3",
                message="当前存在高风险信号，不生成训练处方，建议医学评估或专业转介。",
                allow_ai_generation=False,
                allow_auto_publish=False,
                requires_expert_review=True,
                intensity_cap="不生成训练强度；仅输出安全提醒、医学评估或转介建议",
                contraindications=contraindications,
                matched_rules=matched_rules,
                source_snapshot=snapshot,
            )

        if any(rule.severity == "YELLOW" for rule in matched):
            return RiskEvaluationResult(
                risk_level="R2",
                message="当前属于中风险干预型，可生成谨慎型 AI 初稿，但必须专家审核后发布。",
                allow_ai_generation=True,
                allow_auto_publish=False,
                requires_expert_review=True,
                intensity_cap="低强度起步，逐步过渡到中等强度；禁止自动推荐高强度",
                contraindications=contraindications,
                matched_rules=matched_rules,
                source_snapshot=snapshot,
            )

        if any(rule.severity == "GREEN" for rule in matched):
            return RiskEvaluationResult(
                risk_level="R1",
                message="当前属于低风险改善型，可自动生成改善型处方并建议后台抽查。",
                allow_ai_generation=True,
                allow_auto_publish=True,
                requires_expert_review=False,
                intensity_cap="低—中等强度起步，循序渐进增加总运动量",
                contraindications=contraindications,
                matched_rules=matched_rules,
                source_snapshot=snapshot,
            )

        return RiskEvaluationResult(
            risk_level="R0",
            message="当前无明显疾病风险、运动禁忌和异常体质指标，可自动生成基础运动处方。",
            allow_ai_generation=True,
            allow_auto_publish=True,
            requires_expert_review=False,
            intensity_cap="低—中等强度起步，有基础者可逐步提高",
            contraindications=[],
            matched_rules=matched_rules,
            source_snapshot=snapshot,
        )
