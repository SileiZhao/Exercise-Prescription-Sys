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


def import_exercise_actions(db: Session, path: str | Path) -> dict[str, int]:
    items = _load_items(Path(path))
    created = 0
    updated = 0

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
        action.suitable_tags = _clean_list(item.get("suitable_tags"))
        action.contraindication_tags = _clean_list(item.get("contraindication_tags"))
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
        action.status = ActionReviewStatus.PENDING_REVIEW
        action.reviewed_by = None
        action.reviewed_at = None

    db.commit()
    return {"created": created, "updated": updated}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入运动动作库 JSON 文件，导入动作默认进入待审核。")
    parser.add_argument("path", help="JSON 文件路径，数组元素需包含 name/category。")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = import_exercise_actions(db, args.path)
        print(f"Imported exercise actions: created={result['created']}, updated={result['updated']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
