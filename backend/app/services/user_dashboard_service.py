from datetime import date, timedelta
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
)
from app.models.prescription import PrescriptionRecord


class UserDashboardService:
    def __init__(self, db: Session):
        self.db = db

    def summary(self, user_id: int) -> dict[str, Any]:
        prescription = self._latest_prescription(user_id)
        risk = self._latest_risk(user_id)
        profile = self._profile(user_id)
        fitness = self._latest_fitness(user_id)
        body_composition = self._latest_body_composition(user_id)
        biochemical = self._latest_biochemical(user_id)
        feedback_items = self._recent_feedback(user_id, prescription.id if prescription else None)
        current_risk = prescription.risk_level if prescription else risk.risk_level if risk else None
        today_can_exercise, block_reason = self._exercise_gate(prescription)
        weekly_items = [item for item in feedback_items if item.exercise_date >= date.today() - timedelta(days=6)]
        latest_feedback = feedback_items[0] if feedback_items else None
        goals = prescription.goals if prescription else (profile.exercise_goal if profile else [])
        return {
            "current_risk_level": current_risk,
            "expert_review_status": prescription.status if prescription else "NO_PRESCRIPTION",
            "today_can_exercise": today_can_exercise,
            "today_block_reason": block_reason,
            "weekly_completion_rate": self._average_completion(weekly_items),
            "profile_completion_rate": self._profile_completion_rate(
                profile, fitness, body_composition, biochemical, risk, latest_feedback
            ),
            "current_stage_goals": goals,
            "recent_feedback": self._feedback_payload(latest_feedback),
            "monitoring_reminders": self._monitoring_reminders(current_risk, risk, fitness, biochemical),
            "prescription_id": prescription.id if prescription else None,
            "prescription_version": prescription.version if prescription else None,
            "next_reassessment_date": self._next_reassessment_date(prescription),
            "streak_days": self._streak_days(feedback_items),
            "weekly_target_hits": len(weekly_items),
            "plan_completion_trend": [round(float(item.completion_rate), 2) for item in reversed(feedback_items[:7])],
            "feedback_trend": self._feedback_trend(feedback_items),
            "health_radar": self._health_radar(profile, fitness, body_composition, biochemical),
            "abnormal_feedback_count": sum(1 for item in feedback_items if self._is_abnormal(item)),
            "review_status_label": self._review_label(prescription),
            "prescription_summary": self._prescription_summary(prescription),
            "risk_rule_hits": self._risk_rule_hits(prescription, risk, current_risk),
        }

    def _latest_prescription(self, user_id: int) -> PrescriptionRecord | None:
        return self.db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.version.desc(), PrescriptionRecord.created_at.desc(), PrescriptionRecord.id.desc())
            .limit(1)
        )

    def _latest_risk(self, user_id: int) -> RiskScreening | None:
        return self.db.scalar(
            select(RiskScreening).where(RiskScreening.user_id == user_id).order_by(RiskScreening.created_at.desc()).limit(1)
        )

    def _profile(self, user_id: int) -> UserProfile | None:
        return self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id).limit(1))

    def _latest_fitness(self, user_id: int) -> FitnessTest | None:
        return self.db.scalar(
            select(FitnessTest).where(FitnessTest.user_id == user_id).order_by(FitnessTest.measured_at.desc()).limit(1)
        )

    def _latest_body_composition(self, user_id: int) -> BodyComposition | None:
        return self.db.scalar(
            select(BodyComposition)
            .where(BodyComposition.user_id == user_id)
            .order_by(BodyComposition.measured_at.desc())
            .limit(1)
        )

    def _latest_biochemical(self, user_id: int) -> BiochemicalIndex | None:
        return self.db.scalar(
            select(BiochemicalIndex)
            .where(BiochemicalIndex.user_id == user_id)
            .order_by(BiochemicalIndex.measured_at.desc())
            .limit(1)
        )

    def _recent_feedback(self, user_id: int, prescription_id: int | None) -> list[ExerciseFeedback]:
        statement = select(ExerciseFeedback).where(ExerciseFeedback.user_id == user_id)
        if prescription_id is not None:
            statement = statement.where(ExerciseFeedback.prescription_id == prescription_id)
        return list(
            self.db.scalars(statement.order_by(ExerciseFeedback.exercise_date.desc(), ExerciseFeedback.id.desc()).limit(30))
        )

    def _exercise_gate(self, prescription: PrescriptionRecord | None) -> tuple[bool, str | None]:
        if prescription is None:
            return False, "尚未生成处方"
        if prescription.risk_level == "R3":
            return False, "R3 风险需转诊或医学评估"
        if prescription.status != "PUBLISHED":
            return False, "处方发布前不可执行"
        return True, None

    def _average_completion(self, feedback_items: list[ExerciseFeedback]) -> float:
        if not feedback_items:
            return 0
        return round(sum(float(item.completion_rate) for item in feedback_items) / len(feedback_items), 2)

    def _profile_completion_rate(
        self,
        profile: UserProfile | None,
        fitness: FitnessTest | None,
        body_composition: BodyComposition | None,
        biochemical: BiochemicalIndex | None,
        risk: RiskScreening | None,
        feedback: ExerciseFeedback | None,
    ) -> float:
        completed = sum(
            item is not None
            for item in [profile, fitness, body_composition, biochemical, risk, feedback]
        )
        return round(completed / 6 * 100, 2)

    def _feedback_payload(self, feedback: ExerciseFeedback | None) -> dict[str, Any]:
        if feedback is None:
            return {
                "exercise_date": None,
                "exercise_type": None,
                "rpe": None,
                "pain_score_after": None,
                "discomfort": [],
                "completion_rate": None,
            }
        return {
            "exercise_date": feedback.exercise_date,
            "exercise_type": feedback.exercise_type,
            "rpe": feedback.rpe,
            "pain_score_after": feedback.pain_score_after,
            "discomfort": feedback.discomfort or [],
            "completion_rate": feedback.completion_rate,
        }

    def _feedback_trend(self, feedback_items: list[ExerciseFeedback]) -> list[dict[str, Any]]:
        return [
            {
                "date": item.exercise_date,
                "rpe": float(item.rpe),
                "pain": item.pain_score_after,
                "completion_rate": float(item.completion_rate),
            }
            for item in reversed(feedback_items[:7])
        ]

    def _health_radar(
        self,
        profile: UserProfile | None,
        fitness: FitnessTest | None,
        body_composition: BodyComposition | None,
        biochemical: BiochemicalIndex | None,
    ) -> list[dict[str, float | str]]:
        metrics: list[dict[str, float | str]] = []

        def add(metric: str, value: float | int | None, max_value: float) -> None:
            if value is None:
                return
            metrics.append({"metric": metric, "value": round(float(value), 2), "max": max_value})

        add("BMI", profile.bmi if profile else None, 40)
        add("收缩压", fitness.sbp if fitness else None, 180)
        add("舒张压", fitness.dbp if fitness else None, 110)
        add("静息心率", fitness.resting_hr if fitness else None, 120)
        add("疼痛", fitness.pain_score if fitness else None, 10)
        add("体脂率", body_composition.body_fat_pct if body_composition else None, 45)
        add("内脏脂肪", body_composition.visceral_fat_level if body_composition else None, 20)
        add("空腹血糖", biochemical.fbg if biochemical else None, 16.7)
        add("糖化血红蛋白", biochemical.hba1c if biochemical else None, 12)
        return metrics

    def _monitoring_reminders(
        self,
        current_risk: str | None,
        risk: RiskScreening | None,
        fitness: FitnessTest | None,
        biochemical: BiochemicalIndex | None,
    ) -> list[str]:
        reminders: list[str] = []
        if (risk and risk.has_hypertension) or (fitness and (fitness.sbp >= 140 or fitness.dbp >= 90)):
            reminders.append("血压监测提醒")
        if (risk and risk.has_diabetes) or (biochemical and biochemical.fbg is not None):
            reminders.append("血糖监测提醒")
        if current_risk == "R3":
            reminders.append("医学评估提醒")
        return reminders

    def _next_reassessment_date(self, prescription: PrescriptionRecord | None) -> date | None:
        if prescription is None:
            return None
        weeks = 4
        match = re.search(r"(\d+)\s*周", prescription.reassessment or "")
        if match:
            weeks = int(match.group(1))
        return prescription.created_at.date() + timedelta(weeks=weeks)

    def _streak_days(self, feedback_items: list[ExerciseFeedback]) -> int:
        days = sorted({item.exercise_date for item in feedback_items}, reverse=True)
        if not days:
            return 0
        streak = 1
        for previous, current in zip(days, days[1:], strict=False):
            if previous - current == timedelta(days=1):
                streak += 1
            else:
                break
        return streak

    def _is_abnormal(self, feedback: ExerciseFeedback) -> bool:
        discomfort = set(feedback.discomfort or [])
        return (
            bool(discomfort)
            or feedback.rpe >= 17
            or feedback.completion_rate < 60
            or (feedback.pain_score_after is not None and feedback.pain_score_after >= 4)
        )

    def _review_label(self, prescription: PrescriptionRecord | None) -> str:
        if prescription is None:
            return "未生成处方"
        labels = {
            "PUBLISHED": "已发布",
            "PENDING_REVIEW": "专家审核中",
            "REFERRED": "已转诊",
            "NEEDS_INFO": "需补充资料",
            "PAUSED": "暂停运动",
            "SUPERSEDED": "历史版本",
        }
        return labels.get(prescription.status, prescription.status)

    def _risk_rule_hits(
        self,
        prescription: PrescriptionRecord | None,
        risk: RiskScreening | None,
        current_risk: str | None,
    ) -> list[dict[str, Any]]:
        payload_rules = (prescription.llm_payload or {}).get("risk_rules") if prescription else None
        hits = [
            hit
            for hit in (self._normalize_risk_rule(item, current_risk) for item in (payload_rules or []))
            if hit is not None
        ]
        if hits:
            return hits
        return [
            {
                "rule_id": f"RISK_REASON_{index}",
                "rule_name": "风险规则命中",
                "field_path": None,
                "hit_value": None,
                "threshold": None,
                "action_label": self._risk_action_label(current_risk),
                "risk_level": current_risk,
                "explanation": reason,
            }
            for index, reason in enumerate(risk.risk_reasons or [], start=1)
            if reason
        ] if risk else []

    def _normalize_risk_rule(self, rule: Any, current_risk: str | None) -> dict[str, Any] | None:
        if isinstance(rule, str):
            text = rule.strip()
            if not text:
                return None
            return {
                "rule_id": text,
                "rule_name": text,
                "field_path": None,
                "hit_value": None,
                "threshold": None,
                "action_label": self._risk_action_label(current_risk),
                "risk_level": current_risk,
                "explanation": text,
            }
        if not isinstance(rule, dict):
            return None
        rule_id = rule.get("rule_id") or rule.get("code") or rule.get("id")
        rule_name = rule.get("rule_name") or rule.get("name") or rule.get("title") or rule_id
        explanation = rule.get("message") or rule.get("explanation") or rule.get("description") or rule.get("reason")
        if not any([rule_id, rule_name, explanation]):
            return None
        level = rule.get("risk_level") or self._severity_to_risk_level(rule.get("severity")) or current_risk
        return {
            "rule_id": rule_id,
            "rule_name": str(rule_name) if rule_name is not None else None,
            "field_path": rule.get("field_path") or rule.get("path") or rule.get("field"),
            "hit_value": rule.get("hit_value") if "hit_value" in rule else rule.get("value"),
            "threshold": rule.get("threshold") or rule.get("limit") or rule.get("operator"),
            "action_label": rule.get("action_label") or rule.get("action") or self._risk_action_label(level),
            "risk_level": level,
            "explanation": explanation,
        }

    def _severity_to_risk_level(self, severity: Any) -> str | None:
        mapping = {"GREEN": "R1", "YELLOW": "R2", "RED": "R3"}
        return mapping.get(str(severity or "").upper())

    def _risk_action_label(self, risk_level: str | None) -> str:
        if risk_level == "R3":
            return "阻断训练处方"
        if risk_level == "R2":
            return "提交专家审核"
        if risk_level in {"R0", "R1"}:
            return "纳入处方边界"
        return "纳入风险判定"

    def _prescription_summary(self, prescription: PrescriptionRecord | None) -> dict[str, Any] | None:
        if prescription is None:
            return None
        return {
            "cluster_label": prescription.cluster_label,
            "fitt_vp": prescription.fitt_vp,
            "safety_notice": prescription.safety_notice,
            "reassessment": prescription.reassessment,
        }
