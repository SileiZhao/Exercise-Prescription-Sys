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
from app.models.template import PrescriptionTemplate, TemplateStatus

REQUIRED_FITT_VP_KEYS = {"frequency", "intensity", "time", "type", "volume", "progression"}


def _load_items(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items", [])
    if not isinstance(data, list):
        raise ValueError("处方模板导入文件必须是 JSON 数组，或包含 items 数组的对象。")
    return data


def _clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise ValueError("标签字段必须是字符串或数组。")


def _clean_status(value: Any) -> TemplateStatus:
    if value is None:
        return TemplateStatus.DRAFT
    try:
        return TemplateStatus(str(value).strip())
    except ValueError as exc:
        raise ValueError("status 必须是 DRAFT、APPROVED 或 ARCHIVED。") from exc


def _validate_fitt_vp(value: Any, index: int, risk_level: str) -> dict[str, Any] | None:
    if risk_level == "R3":
        if value is not None:
            raise ValueError(f"第 {index} 个 R3 安全提醒模板不能包含 FITT-VP 对象。")
        return None
    if not isinstance(value, dict):
        raise ValueError(f"第 {index} 个模板的 FITT-VP 必须是对象。")
    missing = REQUIRED_FITT_VP_KEYS - set(value)
    if missing:
        raise ValueError(f"第 {index} 个模板缺少 FITT-VP 字段：{', '.join(sorted(missing))}。")
    cleaned = dict(value)
    if not isinstance(cleaned.get("type"), list):
        cleaned["type"] = _clean_list(cleaned.get("type"))
    return cleaned


def import_prescription_templates(
    db: Session,
    path: str | Path,
    created_by: int | None = None,
    increment_version_on_update: bool = True,
    approve_drafts: bool = False,
) -> dict[str, int]:
    items = _load_items(Path(path))
    created = 0
    updated = 0

    for index, item in enumerate(items, start=1):
        name = str(item.get("name", "")).strip()
        risk_level = str(item.get("risk_level", "")).strip()
        if not name or not risk_level:
            raise ValueError(f"第 {index} 个模板缺少 name 或 risk_level。")
        if risk_level not in {"R0", "R1", "R2", "R3"}:
            raise ValueError(f"第 {index} 个模板 risk_level 必须是单一 R0/R1/R2/R3。")

        template = db.scalar(select(PrescriptionTemplate).where(PrescriptionTemplate.name == name))
        fitt_vp = _validate_fitt_vp(item.get("fitt_vp"), index, risk_level)
        if template is None:
            template = PrescriptionTemplate(name=name, risk_level=risk_level, fitt_vp=fitt_vp, created_by=created_by)
            db.add(template)
            created += 1
        else:
            if increment_version_on_update:
                template.version += 1
            updated += 1

        template.risk_level = risk_level
        template.cluster_tags = _clean_list(item.get("cluster_tags"))
        template.goal_tags = _clean_list(item.get("goal_tags"))
        template.fitt_vp = fitt_vp
        template.precautions = _clean_list(item.get("precautions"))
        template.contraindications = _clean_list(item.get("contraindications"))
        template.evidence_refs = _clean_list(item.get("evidence_refs"))
        status = _clean_status(item.get("status"))
        template.status = TemplateStatus.APPROVED if approve_drafts and status == TemplateStatus.DRAFT else status
        if created_by is not None and template.created_by is None:
            template.created_by = created_by

    db.commit()
    return {"created": created, "updated": updated}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 FITT-VP 处方模板 JSON 文件。")
    parser.add_argument("path", help="JSON 文件路径，数组元素需包含 name/risk_level/fitt_vp。")
    parser.add_argument("--approve-drafts", action="store_true", help="将 DRAFT 草案模板按第一版可用模板导入为 APPROVED。")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = import_prescription_templates(db, args.path, approve_drafts=args.approve_drafts)
        print(f"Imported prescription templates: created={result['created']}, updated={result['updated']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
