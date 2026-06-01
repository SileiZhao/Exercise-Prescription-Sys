from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import utcnow
from app.models.health_data import ExerciseFeedback
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.services.audit_service import AuditService


@dataclass(slots=True)
class FeedbackAdjustmentDecision:
    action: str
    reasons: list[str] = field(default_factory=list)
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
        reasons = self._decision_reasons(feedback)
        action = self._decision_action(reasons)

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
            snapshot=self._version_snapshot(prescription, feedback, action, reasons),
            change_reason="FEEDBACK_ADJUSTMENT",
            actor_id=actor_id,
        )
        self.db.add(version)
        self.audit.record(
            action="FEEDBACK_ADJUST_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            resource_id=str(prescription.id),
            actor_id=actor_id or feedback.user_id,
            metadata={"feedback_id": feedback.id, "decision": action, "reasons": reasons},
        )
        self.db.commit()
        self.db.refresh(version)
        self.db.refresh(prescription)
        return FeedbackAdjustmentDecision(
            action=action,
            reasons=reasons,
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
            recommendations=recommendations,
        )

    def _resolve_prescription(self, feedback: ExerciseFeedback) -> PrescriptionRecord:
        prescription: PrescriptionRecord | None = None
        if feedback.prescription_id is not None:
            prescription = self.db.get(PrescriptionRecord, feedback.prescription_id)
        if prescription is None:
            prescription = self.db.scalar(
                select(PrescriptionRecord)
                .where(PrescriptionRecord.user_id == feedback.user_id)
                .order_by(PrescriptionRecord.created_at.desc())
            )
        if prescription is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到可调整处方")
        if prescription.user_id != feedback.user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="反馈与处方用户不一致")
        return prescription

    def _decision_reasons(self, feedback: ExerciseFeedback) -> list[str]:
        reasons: list[str] = []
        discomfort = set(feedback.discomfort or [])
        red_hits = sorted(discomfort & self.red_alert_terms)
        if red_hits:
            reasons.append("红色预警：" + "、".join(red_hits))
        if feedback.pain_score_after is not None and feedback.pain_score_after >= 7:
            reasons.append("疼痛达到红色阈值")
        elif feedback.pain_score_after is not None and feedback.pain_score_after >= 4:
            reasons.append("疼痛加重")
        elif "疼痛" in discomfort:
            reasons.append("疼痛加重")
        if feedback.rpe >= 8:
            reasons.append("RPE偏高")
        if feedback.completion_rate < 60:
            reasons.append("完成率偏低")
        if feedback.completion_rate >= 85 and not discomfort and feedback.rpe <= 6:
            reasons.append("完成率高且无不适")
        if not reasons:
            reasons.append("反馈稳定")
        return reasons

    def _decision_action(self, reasons: list[str]) -> str:
        if any(reason.startswith("红色预警") or reason == "疼痛达到红色阈值" for reason in reasons):
            return "RED_ALERT"
        if "疼痛加重" in reasons or "RPE偏高" in reasons:
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
    ) -> dict[str, Any]:
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
            },
            "adjustment": {"action": action, "reasons": reasons},
            "updated_at": utcnow().isoformat(),
        }
