from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import utcnow
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    UserProfileMeasurement,
)
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.services.audit_service import AuditService
from app.services.prescription_safety_service import require_executable_prescription


@dataclass(slots=True)
class FeedbackAdjustmentDecision:
    action: str
    reasons: list[str] = field(default_factory=list)
    triggered_rules: list[str] = field(default_factory=list)
    new_prescription_id: int | None = None
    version_id: int | None = None


@dataclass(slots=True)
class PhaseAssessment:
    prescription_id: int | None
    weeks: int
    feedback_count: int
    average_completion_rate: float
    average_rpe: float
    pain_events: int
    discomfort_events: int
    red_alert_events: int
    decision: str
    summary: str
    measurement_changes: dict[str, Any] = field(default_factory=dict)
    recommendations: list[str] = field(default_factory=list)


class FeedbackAdjustmentService:
    red_alert_terms = {"胸痛", "胸闷", "晕厥", "头晕", "黑蒙", "严重气短", "气短", "喘憋", "心悸"}

    def __init__(self, db: Session):
        self.db = db
        self.audit = AuditService(db)

    def adjust_after_feedback(self, feedback_id: int, actor_id: int | None = None) -> FeedbackAdjustmentDecision:
        feedback = self.db.get(ExerciseFeedback, feedback_id)
        if feedback is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运动反馈不存在")

        prescription = self._resolve_prescription(feedback)
        before_snapshot = self._prescription_state(prescription)
        reasons, triggered_rules = self._decision_reasons(feedback)
        action = self._decision_action(reasons, triggered_rules)

        if action == "RED_ALERT":
            self._apply_red_alert(prescription, reasons)
        elif action == "REVIEW_REQUIRED":
            self._apply_review_required(prescription, feedback, reasons)
        elif action == "DEGRADE":
            self._apply_degrade(prescription, reasons)
        elif action == "PROGRESS":
            self._apply_progress(prescription, reasons)
        else:
            self._apply_maintain(prescription, reasons)

        prescription.version += 1
        prescription.updated_at = utcnow()
        version = PrescriptionVersion(
            prescription_id=prescription.id,
            version=prescription.version,
            snapshot=self._version_snapshot(prescription, feedback, action, reasons, triggered_rules, before_snapshot),
            change_reason="FEEDBACK_ADJUSTMENT",
            actor_id=actor_id,
        )
        self.db.add(version)
        self.audit.record(
            action="FEEDBACK_ADJUST_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(prescription.id),
            actor_id=actor_id or feedback.user_id,
            metadata={
                "feedback_id": feedback.id,
                "decision": action,
                "reasons": reasons,
                "triggered_rules": triggered_rules,
                "before_after_diff": self._before_after_diff(before_snapshot, self._prescription_state(prescription)),
            },
        )
        self.db.commit()
        self.db.refresh(version)
        self.db.refresh(prescription)
        return FeedbackAdjustmentDecision(
            action=action,
            reasons=reasons,
            triggered_rules=triggered_rules,
            new_prescription_id=prescription.id,
            version_id=version.id,
        )

    def phase_assessment(
        self,
        user_id: int,
        prescription_id: int | None = None,
        weeks: int = 4,
    ) -> PhaseAssessment:
        if weeks < 1 or weeks > 12:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="评估周期必须为1-12周")
        if prescription_id is not None:
            prescription = self.db.get(PrescriptionRecord, prescription_id)
            if prescription is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="处方不存在")
            if prescription.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

        start_date = date.today() - timedelta(weeks=weeks)
        statement = select(ExerciseFeedback).where(
            ExerciseFeedback.user_id == user_id,
            ExerciseFeedback.exercise_date >= start_date,
        )
        if prescription_id is not None:
            statement = statement.where(ExerciseFeedback.prescription_id == prescription_id)
        feedback_items = list(self.db.scalars(statement.order_by(ExerciseFeedback.exercise_date.asc())))
        if not feedback_items:
            return PhaseAssessment(
                prescription_id=prescription_id,
                weeks=weeks,
                feedback_count=0,
                average_completion_rate=0,
                average_rpe=0,
                pain_events=0,
                discomfort_events=0,
                red_alert_events=0,
                decision="NO_DATA",
                summary="当前评估周期内暂无运动打卡记录。",
                measurement_changes=self._measurement_changes(user_id),
                recommendations=["继续按处方执行并完成运动打卡"],
            )

        feedback_count = len(feedback_items)
        average_completion = round(sum(item.completion_rate for item in feedback_items) / feedback_count, 2)
        average_rpe = round(sum(item.rpe for item in feedback_items) / feedback_count, 2)
        pain_events = sum(
            1
            for item in feedback_items
            if (item.pain_score_after is not None and item.pain_score_after >= 4) or "疼痛" in (item.discomfort or [])
        )
        discomfort_events = sum(1 for item in feedback_items if item.discomfort)
        red_alert_events = sum(1 for item in feedback_items if set(item.discomfort or []) & self.red_alert_terms)
        decision, recommendations = self._phase_decision(
            average_completion,
            average_rpe,
            pain_events,
            red_alert_events,
            feedback_count,
        )
        summary = (
            f"近{weeks}周共记录{feedback_count}次运动反馈，平均完成率{average_completion}%，"
            f"平均RPE {average_rpe}，疼痛事件{pain_events}次，不适事件{discomfort_events}次。"
        )
        return PhaseAssessment(
            prescription_id=prescription_id,
            weeks=weeks,
            feedback_count=feedback_count,
            average_completion_rate=average_completion,
            average_rpe=average_rpe,
            pain_events=pain_events,
            discomfort_events=discomfort_events,
            red_alert_events=red_alert_events,
            decision=decision,
            summary=summary,
            measurement_changes=self._measurement_changes(user_id),
            recommendations=recommendations,
        )

    def _measurement_changes(self, user_id: int) -> dict[str, Any]:
        return {
            "profile": self._profile_change(user_id),
            "fitness_test": self._measurement_change(
                FitnessTest,
                user_id,
                FitnessTest.measured_at,
                ["sbp", "dbp"],
                "FitnessTest 记录不足 2 条，无法计算最早与最新差值",
            ),
            "body_composition": self._measurement_change(
                BodyComposition,
                user_id,
                BodyComposition.measured_at,
                ["body_fat_pct", "skeletal_muscle_kg"],
                "BodyComposition 记录不足 2 条，无法计算最早与最新差值",
            ),
            "biochemical_index": self._measurement_change(
                BiochemicalIndex,
                user_id,
                BiochemicalIndex.measured_at,
                ["fbg", "tc", "tg", "hdl_c", "ldl_c"],
                "BiochemicalIndex 记录不足 2 条，无法计算最早与最新差值",
            ),
        }

    def _profile_change(self, user_id: int) -> dict[str, dict[str, Any]]:
        records = list(
            self.db.scalars(
                select(UserProfileMeasurement)
                .where(UserProfileMeasurement.user_id == user_id)
                .order_by(UserProfileMeasurement.measured_at.asc(), UserProfileMeasurement.id.asc())
            )
        )
        return self._delta_map(
            records,
            ["weight_kg", "bmi", "waist_cm"],
            "UserProfileMeasurement 记录不足 2 条，无法计算最早与最新差值",
        )

    def _measurement_change(
        self,
        model: Any,
        user_id: int,
        order_column: Any,
        fields: list[str],
        null_reason: str,
    ) -> dict[str, dict[str, Any]]:
        records = list(
            self.db.scalars(
                select(model).where(model.user_id == user_id).order_by(order_column.asc(), model.id.asc())
            )
        )
        return self._delta_map(records, fields, null_reason)

    def _delta_map(self, records: list[Any], fields: list[str], null_reason: str) -> dict[str, dict[str, Any]]:
        if len(records) < 2:
            return {field: {"value": None, "null_reason": null_reason} for field in fields}
        earliest = records[0]
        latest = records[-1]
        result: dict[str, dict[str, Any]] = {}
        for field in fields:
            before = getattr(earliest, field, None)
            after = getattr(latest, field, None)
            if before is None or after is None:
                result[field] = {
                    "value": None,
                    "null_reason": f"{field} 最早或最新记录为空，无法计算差值",
                }
            else:
                result[field] = {
                    "before": before,
                    "after": after,
                    "delta": round(float(after) - float(before), 4),
                }
        return result

    def _resolve_prescription(self, feedback: ExerciseFeedback) -> PrescriptionRecord:
        return require_executable_prescription(
            self.db,
            user_id=feedback.user_id,
            prescription_id=feedback.prescription_id,
        )

    def _decision_reasons(self, feedback: ExerciseFeedback) -> tuple[list[str], list[str]]:
        reasons: list[str] = []
        triggered_rules: list[str] = []
        discomfort = set(feedback.discomfort or [])
        red_hits = sorted(discomfort & self.red_alert_terms)
        if red_hits:
            reasons.append("红色预警：" + "、".join(red_hits))
            triggered_rules.append("RED_FLAG_SYMPTOMS")
        if (feedback.pre_ex_bp_sbp is not None and feedback.pre_ex_bp_sbp >= 180) or (
            feedback.pre_ex_bp_dbp is not None and feedback.pre_ex_bp_dbp >= 110
        ):
            reasons.append("血压达到停止运动阈值")
            triggered_rules.append("BP_STOP_180_110")
        if feedback.pre_glucose is not None and (feedback.pre_glucose < 3.9 or feedback.pre_glucose > 16.7):
            reasons.append("空腹血糖超出当日运动安全范围")
            triggered_rules.append("GLUCOSE_PAUSE_3_9_16_7")
        if feedback.max_hr is not None and feedback.max_hr >= 200:
            reasons.append("异常心率")
            triggered_rules.append("ABNORMAL_HEART_RATE_REVIEW")
        if feedback.pain_score_after is not None and feedback.pain_score_after >= 7:
            reasons.append("疼痛达到红色阈值")
            triggered_rules.append("PAIN_RED_7")
        elif feedback.pain_score_after is not None and feedback.pain_score_after >= 4:
            reasons.append("疼痛加重")
            triggered_rules.append("PAIN_WORSEN_REVIEW")
        elif "疼痛" in discomfort:
            reasons.append("疼痛加重")
            triggered_rules.append("PAIN_WORSEN_REVIEW")
        if feedback.rpe >= 17 and self._previous_high_rpe_count(feedback) >= 1:
            reasons.append("RPE连续两次达到高阈值")
            triggered_rules.append("RPE_CONSECUTIVE_HIGH_17")
        elif feedback.rpe >= 17:
            reasons.append("RPE偏高")
            triggered_rules.append("RPE_HIGH_REVIEW")
        elif feedback.rpe >= 8:
            reasons.append("RPE偏高")
            triggered_rules.append("RPE_HIGH_REVIEW")
        if feedback.completion_rate < 60:
            reasons.append("完成率偏低")
            triggered_rules.append("COMPLETION_LOW_60")
        if feedback.completion_rate >= 85 and not discomfort and feedback.rpe <= 6:
            reasons.append("完成率高且无不适")
            triggered_rules.append("ADAPTATION_GOOD_PROGRESS")
        if not reasons:
            reasons.append("反馈稳定")
            triggered_rules.append("FEEDBACK_STABLE")
        return reasons, list(dict.fromkeys(triggered_rules))

    def _decision_action(self, reasons: list[str], triggered_rules: list[str]) -> str:
        if any(rule in triggered_rules for rule in ["RED_FLAG_SYMPTOMS", "BP_STOP_180_110", "PAIN_RED_7"]):
            return "RED_ALERT"
        if "RPE_CONSECUTIVE_HIGH_17" in triggered_rules or "COMPLETION_LOW_60" in triggered_rules:
            return "DEGRADE"
        if "GLUCOSE_PAUSE_3_9_16_7" in triggered_rules:
            return "REVIEW_REQUIRED"
        if "疼痛加重" in reasons or "RPE偏高" in reasons or "异常心率" in reasons:
            return "REVIEW_REQUIRED"
        if "完成率偏低" in reasons:
            return "DEGRADE"
        if "完成率高且无不适" in reasons:
            return "PROGRESS"
        return "MAINTAIN"

    def _phase_decision(
        self,
        average_completion: float,
        average_rpe: float,
        pain_events: int,
        red_alert_events: int,
        feedback_count: int,
    ) -> tuple[str, list[str]]:
        if red_alert_events > 0:
            return "RED_ALERT", ["出现红色预警信号，暂停训练并建议医学评估"]
        if pain_events > 0 or average_rpe >= 8:
            return "REVIEW_REQUIRED", ["疼痛或RPE偏高，进入专家复核"]
        if average_completion < 60:
            return "DEGRADE", ["完成率偏低，下一阶段降低复杂度或缩短单次时长"]
        if feedback_count >= 3 and average_completion >= 85 and average_rpe <= 6:
            return "PROGRESS", ["完成率高且无明显不适，下一阶段可小幅进阶"]
        return "MAINTAIN", ["反馈总体稳定，维持当前处方并继续观察"]

    def _apply_red_alert(self, prescription: PrescriptionRecord, reasons: list[str]) -> None:
        prescription.risk_level = "R3"
        prescription.status = "REFERRED"
        prescription.fitt_vp = None
        prescription.expert_review_required = True
        prescription.safety_notice = (
            "出现运动中红色预警信号（"
            + "；".join(reasons)
            + "），建议立即停止训练并进行医学评估或专业转介。"
        )
        prescription.precautions = self._append_unique(
            prescription.precautions,
            ["暂停当前训练", "完成医学评估前不生成具体训练处方"],
        )

    def _apply_review_required(
        self,
        prescription: PrescriptionRecord,
        feedback: ExerciseFeedback,
        reasons: list[str],
    ) -> None:
        prescription.status = "PENDING_REVIEW"
        prescription.expert_review_required = True
        prescription.safety_notice = "运动反馈提示需要专家复核：" + "；".join(reasons)
        prescription.precautions = self._append_unique(
            prescription.precautions,
            ["降低当次训练强度", "专家复核前避免新增高冲击或高强度训练"],
        )
        if feedback.pain_score_after is not None and feedback.pain_score_after >= 4:
            prescription.contraindications = self._append_unique(
                prescription.contraindications,
                ["疼痛部位大负荷训练", "跳跃和快速变向动作"],
            )

    def _apply_degrade(self, prescription: PrescriptionRecord, reasons: list[str]) -> None:
        prescription.status = "PUBLISHED"
        prescription.expert_review_required = False
        prescription.safety_notice = "完成率偏低，系统建议下调训练负荷并观察下一周期反馈。"
        prescription.precautions = self._append_unique(
            prescription.precautions,
            ["优先保证完成率", "下一周期不同时增加强度和时间"],
        )
        self._soften_progression(prescription, "下一周期维持低强度，单次时间减少10%-20%后再评估。")

    def _apply_progress(self, prescription: PrescriptionRecord, reasons: list[str]) -> None:
        prescription.status = "PUBLISHED"
        prescription.expert_review_required = False
        prescription.safety_notice = "完成率较高且无不适，可小幅进阶，但不得同时大幅增加强度和时间。"
        prescription.precautions = self._append_unique(
            prescription.precautions,
            ["进阶幅度控制在10%以内", "如出现疼痛、胸闷、头晕等立即停止并反馈"],
        )
        self._soften_progression(prescription, "下一周期总量或时间小幅增加5%-10%，强度保持低—中等。")

    def _apply_maintain(self, prescription: PrescriptionRecord, reasons: list[str]) -> None:
        prescription.status = "PUBLISHED"
        prescription.expert_review_required = False
        prescription.safety_notice = "反馈稳定，建议维持当前处方并继续记录RPE、心率和不适反应。"

    def _soften_progression(self, prescription: PrescriptionRecord, progression: str) -> None:
        if prescription.fitt_vp is None:
            return
        updated = dict(prescription.fitt_vp)
        updated["progression"] = progression
        prescription.fitt_vp = updated

    def _append_unique(self, current: list[str] | None, values: list[str]) -> list[str]:
        result = list(current or [])
        for value in values:
            if value not in result:
                result.append(value)
        return result

    def _version_snapshot(
        self,
        prescription: PrescriptionRecord,
        feedback: ExerciseFeedback,
        action: str,
        reasons: list[str],
        triggered_rules: list[str],
        before_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        after_snapshot = self._prescription_state(prescription)
        return {
            "risk_level": prescription.risk_level,
            "cluster_label": prescription.cluster_label,
            "goals": prescription.goals,
            "fitt_vp": prescription.fitt_vp,
            "precautions": prescription.precautions,
            "contraindications": prescription.contraindications,
            "reassessment": prescription.reassessment,
            "status": prescription.status,
            "version": prescription.version,
            "safety_notice": prescription.safety_notice,
            "feedback_id": feedback.id,
            "feedback": {
                "completion_rate": feedback.completion_rate,
                "rpe": feedback.rpe,
                "discomfort": feedback.discomfort,
                "pain_score_after": feedback.pain_score_after,
                "pre_ex_bp_sbp": feedback.pre_ex_bp_sbp,
                "pre_ex_bp_dbp": feedback.pre_ex_bp_dbp,
                "pre_glucose": feedback.pre_glucose,
                "max_hr": feedback.max_hr,
            },
            "adjustment": {
                "action": action,
                "reasons": reasons,
                "triggered_rules": triggered_rules,
                "before_after_diff": self._before_after_diff(before_snapshot, after_snapshot),
            },
            "updated_at": utcnow().isoformat(),
        }

    def _previous_high_rpe_count(self, feedback: ExerciseFeedback) -> int:
        items = self.db.scalars(
            select(ExerciseFeedback)
            .where(
                ExerciseFeedback.user_id == feedback.user_id,
                ExerciseFeedback.id != feedback.id,
                ExerciseFeedback.prescription_id == feedback.prescription_id,
            )
            .order_by(ExerciseFeedback.exercise_date.desc(), ExerciseFeedback.id.desc())
            .limit(1)
        ).all()
        return sum(1 for item in items if item.rpe >= 17)

    def _prescription_state(self, prescription: PrescriptionRecord) -> dict[str, Any]:
        return {
            "risk_level": prescription.risk_level,
            "fitt_vp": prescription.fitt_vp,
            "status": prescription.status,
            "expert_review_required": prescription.expert_review_required,
            "safety_notice": prescription.safety_notice,
            "precautions": prescription.precautions,
            "contraindications": prescription.contraindications,
        }

    def _before_after_diff(self, before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
        diff: dict[str, dict[str, Any]] = {}
        for key, before_value in before.items():
            after_value = after.get(key)
            if before_value != after_value:
                diff[key] = {"before": before_value, "after": after_value}
        return diff
