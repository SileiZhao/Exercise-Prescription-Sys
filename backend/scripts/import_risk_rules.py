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
from app.models.risk import RiskRuleConfig

SUPPORTED_OPERATORS = {"eq", "gte", "between", "in_any", "not_empty_restriction"}


def _load_items(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items", data.get("rules", []))
    if not isinstance(data, list):
        raise ValueError("风险规则导入文件必须是 JSON 数组，或包含 items/rules 数组的对象。")
    return data


def _clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()]


def _normalize_rule(item: dict[str, Any], index: int) -> dict[str, Any] | None:
    risk_level = str(item.get("risk_level", "")).strip()
    if risk_level == "R0":
        return None
    code = str(item.get("rule_code") or item.get("code") or "").strip()
    name = str(item.get("rule_name") or item.get("name") or code).strip()
    severity = str(item.get("severity") or "").strip()
    path = str(item.get("field_path") or item.get("path") or "").strip()
    operator = str(item.get("operator") or item.get("op") or "").strip()
    message = str(item.get("user_message") or item.get("message") or item.get("clinical_logic_cn") or "").strip()
    if not code or not name or not severity or not path or not operator or not message:
        raise ValueError(f"第 {index} 条规则缺少 code/name/severity/path/operator/message。")
    if operator not in SUPPORTED_OPERATORS:
        raise ValueError(f"第 {index} 条规则使用未支持操作符：{operator}。")
    if severity not in {"GREEN", "YELLOW", "RED"}:
        raise ValueError(f"第 {index} 条规则 severity 必须是 GREEN、YELLOW 或 RED。")
    return {
        "code": code,
        "name": name,
        "severity": severity,
        "message": message,
        "condition": {
            "path": path,
            "op": operator,
            "value": item.get("value"),
        },
        "contraindications": _clean_list(item.get("contraindications")),
        "intensity_cap": item.get("intensity_cap"),
        "is_active": True,
    }


def import_risk_rules(db: Session, path: str | Path, actor_id: int | None = None) -> dict[str, int]:
    items = _load_items(Path(path))
    created = updated = skipped = errors = 0
    for index, item in enumerate(items, start=1):
        try:
            normalized = _normalize_rule(item, index)
        except ValueError:
            errors += 1
            continue
        if normalized is None:
            skipped += 1
            continue
        rule = db.scalar(select(RiskRuleConfig).where(RiskRuleConfig.code == normalized["code"]))
        if rule is None:
            rule = RiskRuleConfig(**normalized, created_by=actor_id, updated_by=actor_id, version=1)
            db.add(rule)
            created += 1
        else:
            for key, value in normalized.items():
                setattr(rule, key, value)
            rule.updated_by = actor_id
            rule.version += 1
            updated += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 docs 专家规则库 JSON，R0 规则将被跳过。")
    parser.add_argument("path", help="风险规则 JSON 文件路径。")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = import_risk_rules(db, args.path)
        print(
            "Imported risk rules: "
            f"created={result['created']}, updated={result['updated']}, "
            f"skipped={result['skipped']}, errors={result['errors']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
