import argparse
import json
from pathlib import Path
from typing import Any

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.template import ActionReviewStatus, ExerciseAction
from app.models.user import utcnow

TRADITIONAL_KEYWORDS = ("太极拳", "八段锦", "五禽戏", "易筋经", "健身气功")
LOW_IMPACT_KEYWORDS = ("快走", "功率车", "固定自行车", "椭圆机", "低冲击", "坐站", "弹力带", "关节活动度", "平衡", *TRADITIONAL_KEYWORDS)
HIGH_IMPACT_KEYWORDS = ("跳", "跳跃", "跳箱", "长跑", "深蹲", "大重量", "冲刺", "快速变向")
NO_EQUIPMENT = {"", "无", "徒手", "不需要", "none", "no"}


def _load_items(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items", [])
    if not isinstance(data, list):
        raise ValueError("动作库导入文件必须是 JSON 数组，或包含 items 数组的对象。")
    return data


def _clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise ValueError("标签字段必须是字符串或数组。")


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return "\n".join(str(item).strip() for item in value if str(item).strip()) or None
    text = str(value).strip()
    return text or None


def _clean_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "y", "是", "需要"}


def _contains_any(*values: Any, keywords: tuple[str, ...]) -> bool:
    text = " ".join(str(value) for value in values if value is not None)
    return any(keyword.lower() in text.lower() for keyword in keywords)


def _append_unique(values: list[str], additions: list[str]) -> list[str]:
    seen = set(values)
    result = list(values)
    for item in additions:
        if item and item not in seen:
            result.append(item)
            seen.add(item)
    return result


def import_exercise_actions(
    db: Session,
    path: str | Path,
    review_status: ActionReviewStatus = ActionReviewStatus.PENDING_REVIEW,
    reviewed_by: int | None = None,
) -> dict[str, int]:
    items = _load_items(Path(path))
    created = 0
    updated = 0
    approved = 0
    pending = 0

    for index, item in enumerate(items, start=1):
        name = str(item.get("name", "")).strip()
        category = str(item.get("category", "")).strip()
        if not name or not category:
            raise ValueError(f"第 {index} 个动作缺少 name 或 category。")

        action = db.scalar(select(ExerciseAction).where(ExerciseAction.name == name))
        if action is None:
            action = ExerciseAction(name=name, category=category)
            db.add(action)
            created += 1
        else:
            updated += 1

        action.category = category
        action.source = item.get("source") or "docs/ai_exercise_action_library_v0_1_expert_review_draft.json"
        action.source_exercise_id = item.get("source_exercise_id") or item.get("action_code")
        action.name_en = item.get("name_en")
        action.exercise_type = item.get("exercise_type") or category
        action.image_url = item.get("image_url")
        action.joint_stress_level = item.get("joint_stress_level")
        action.impact_level = item.get("impact_level")
        action.requires_equipment = _clean_bool(
            item.get("requires_equipment"),
            default=str(item.get("equipment") or "").strip().lower() not in NO_EQUIPMENT,
        )
        action.is_traditional_exercise = _clean_bool(
            item.get("is_traditional_exercise"),
            default=_contains_any(name, category, keywords=TRADITIONAL_KEYWORDS),
        )
        suitable_tags = _clean_list(item.get("suitable_tags"))
        contraindication_tags = _clean_list(item.get("contraindication_tags"))
        is_low_impact = _contains_any(name, category, suitable_tags, keywords=LOW_IMPACT_KEYWORDS)
        is_high_impact = _contains_any(name, category, contraindication_tags, keywords=HIGH_IMPACT_KEYWORDS)
        if action.impact_level is None:
            action.impact_level = "高" if is_high_impact else "低" if is_low_impact else None
        if action.joint_stress_level is None:
            action.joint_stress_level = "高" if is_high_impact else "低" if is_low_impact else None
        if is_low_impact:
            suitable_tags = _append_unique(suitable_tags, ["低冲击"])
        if is_high_impact:
            contraindication_tags = _append_unique(contraindication_tags, ["跳跃", "疼痛", "下肢关节不稳"])
        action.suitable_tags = suitable_tags
        action.contraindication_tags = contraindication_tags
        action.risk_level = str(item.get("risk_level") or "R1").strip()
        action.body_parts = _clean_list(item.get("body_parts"))
        action.primary_muscles = _clean_list(item.get("primary_muscles"))
        action.equipment = str(item["equipment"]).strip() if item.get("equipment") else None
        action.intensity = str(item.get("intensity") or "低").strip()
        action.difficulty = str(item["difficulty"]).strip() if item.get("difficulty") else None
        action.instructions = _clean_text(item.get("instructions"))
        action.alternatives = _clean_list(item.get("alternatives"))
        action.common_mistakes = _clean_list(item.get("common_mistakes"))
        action.monitoring_tips = _clean_list(item.get("monitoring_tips"))
        action.stop_signals = _clean_list(item.get("stop_signals"))
        action.evidence_refs = _clean_list(item.get("evidence_or_rationale") or item.get("evidence_refs"))
        action.status = review_status
        if review_status == ActionReviewStatus.APPROVED:
            action.reviewed_by = reviewed_by
            action.reviewed_at = utcnow()
            approved += 1
        else:
            action.reviewed_by = None
            action.reviewed_at = None
            if review_status == ActionReviewStatus.PENDING_REVIEW:
                pending += 1

    db.commit()
    return {"created": created, "updated": updated, "approved": approved, "pending": pending}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入运动动作库 JSON 文件，导入动作默认进入待审核。")
    parser.add_argument("path", help="JSON 文件路径，数组元素需包含 name/category。")
    parser.add_argument("--approve", action="store_true", help="将本次导入动作直接标记为专家已批准。")
    parser.add_argument("--reviewed-by", type=int, default=None, help="批准人用户 ID，可选。")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = import_exercise_actions(
            db,
            args.path,
            review_status=ActionReviewStatus.APPROVED if args.approve else ActionReviewStatus.PENDING_REVIEW,
            reviewed_by=args.reviewed_by,
        )
        print(
            "Imported exercise actions: "
            f"created={result['created']}, updated={result['updated']}, "
            f"approved={result['approved']}, pending={result['pending']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
