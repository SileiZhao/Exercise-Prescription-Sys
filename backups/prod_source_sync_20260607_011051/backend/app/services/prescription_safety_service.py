from copy import deepcopy
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.prescription import PrescriptionRecord


FORBIDDEN_R2_TERMS = ("高强度", "HIIT", "冲刺", "大重量", "憋气")
PAIN_FORBIDDEN_TERMS = ("跳跃", "长跑", "深蹲", "快速扭转", "大重量")
HYPERTENSION_FORBIDDEN_TERMS = ("憋气", "大重量")


def _append_unique(items: list[str], values: list[str]) -> list[str]:
    result = list(items or [])
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def _contains_any(text: Any, terms: tuple[str, ...]) -> bool:
    value = str(text or "").lower()
    return any(term.lower() in value for term in terms)


def _filter_actions(actions: list[str], forbidden_terms: tuple[str, ...]) -> list[str]:
    return [action for action in actions if not _contains_any(action, forbidden_terms)]


def _has_diabetes_monitoring_context(snapshot: dict[str, Any]) -> bool:
    screening = snapshot.get("risk_screening") or {}
    medication = screening.get("medication") or []
    if isinstance(medication, str):
        medication = [medication]
    return bool(screening.get("has_diabetes")) or any("降糖" in str(item) or "胰岛素" in str(item) for item in medication)


def enforce_prescription_safety(
    risk_level: str,
    draft: dict[str, Any],
    *,
    risk_contraindications: list[str] | None = None,
    risk_snapshot: dict[str, Any] | None = None,
    template_fitt_vp: dict[str, Any] | None = None,
    candidate_action_names: list[str] | None = None,
) -> dict[str, Any]:
    """Apply non-negotiable post-generation safety rules to a prescription draft."""
    checked = deepcopy(draft)
    checked["risk_level"] = risk_level
    risk_contraindications = risk_contraindications or []
    risk_snapshot = risk_snapshot or {}

    if risk_level == "R3":
        checked["fitt_vp"] = None
        checked["status"] = "REFERRED"
        checked["safety_notice"] = "当前存在高风险信号，系统不生成训练处方，建议先进行医学评估或专业转介。"
        checked["contraindications"] = ["禁止生成具体运动强度、训练动作、组数、时长和进阶计划"]
        return checked

    checked["contraindications"] = _append_unique(checked.get("contraindications") or [], risk_contraindications)
    checked.setdefault("precautions", [])

    fitt_vp = checked.get("fitt_vp")
    if risk_level == "R2" and isinstance(fitt_vp, dict):
        forbidden_terms = FORBIDDEN_R2_TERMS
        if _contains_any(" ".join(risk_contraindications), PAIN_FORBIDDEN_TERMS):
            forbidden_terms = tuple(set([*forbidden_terms, *PAIN_FORBIDDEN_TERMS]))
        if _contains_any(" ".join(risk_contraindications), HYPERTENSION_FORBIDDEN_TERMS):
            forbidden_terms = tuple(set([*forbidden_terms, *HYPERTENSION_FORBIDDEN_TERMS]))

        if template_fitt_vp and (
            _contains_any(fitt_vp.get("intensity"), FORBIDDEN_R2_TERMS)
            or _contains_any(fitt_vp.get("progression"), FORBIDDEN_R2_TERMS)
        ):
            for key in ("frequency", "intensity", "time", "volume", "progression"):
                if template_fitt_vp.get(key):
                    fitt_vp[key] = template_fitt_vp[key]

        action_types = [str(item) for item in fitt_vp.get("type") or []]
        safe_types = _filter_actions(action_types, forbidden_terms)
        if candidate_action_names == [] and template_fitt_vp:
            safe_types = [str(item) for item in template_fitt_vp.get("type") or []]
        if not safe_types and template_fitt_vp:
            safe_types = _filter_actions([str(item) for item in template_fitt_vp.get("type") or []], forbidden_terms)
        fitt_vp["type"] = safe_types

    if _has_diabetes_monitoring_context(risk_snapshot):
        checked["precautions"] = _append_unique(checked.get("precautions") or [], ["运动前后进行血糖监测，随身携带快速糖源。"])

    checked["safety_notice"] = checked.get("safety_notice") or "处方已通过规则安全校验。"
    return checked


def latest_executable_prescription(db: Session, user_id: int) -> PrescriptionRecord | None:
    return db.scalar(
        select(PrescriptionRecord)
        .where(
            PrescriptionRecord.user_id == user_id,
            PrescriptionRecord.status == "PUBLISHED",
            PrescriptionRecord.risk_level != "R3",
            PrescriptionRecord.fitt_vp.is_not(None),
        )
        .order_by(
            PrescriptionRecord.version.desc(),
            PrescriptionRecord.created_at.desc(),
            PrescriptionRecord.id.desc(),
        )
        .limit(1)
    )


def require_executable_prescription(
    db: Session,
    *,
    user_id: int,
    prescription_id: int | None,
) -> PrescriptionRecord:
    if prescription_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="运动打卡必须绑定最新有效已发布处方",
        )

    prescription = db.get(PrescriptionRecord, prescription_id)
    if prescription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="处方不存在",
        )
    if prescription.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该处方不属于当前用户，不能执行或打卡",
        )
    if prescription.status != "PUBLISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="只有已发布处方可以执行和打卡",
        )
    if prescription.risk_level == "R3":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="R3 高风险处方不得执行训练打卡，请先完成医学评估或专家复核",
        )
    if not prescription.fitt_vp:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="处方缺少 FITT-VP 训练结构，不能执行打卡",
        )

    latest_published = latest_executable_prescription(db, user_id)
    if latest_published is None or latest_published.id != prescription.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="只能执行最新有效处方",
        )
    return prescription
