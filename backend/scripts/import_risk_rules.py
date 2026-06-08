import argparse
import json
import re
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
from app.services.audit_service import AuditService

SUPPORTED_OPERATORS = {
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in_any",
    "contains",
    "not_empty_restriction",
    "exists",
}
RISK_LEVEL_TO_SEVERITY = {"R3": "RED", "R2": "YELLOW", "R1": "GREEN", "R0": "GREEN"}


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


def _slug(value: str) -> str:
    slug = re.sub(r"[^\w]+", "-", value.strip().lower(), flags=re.UNICODE).strip("-")
    return slug or "rule"


def _normalize_rule(item: dict[str, Any], index: int, confirm: bool = False) -> dict[str, Any] | None:
    risk_level = str(item.get("risk_level", "")).strip()
    if risk_level == "R0":
        return None
    severity = str(item.get("severity") or RISK_LEVEL_TO_SEVERITY.get(risk_level, "")).strip()
    code = str(item.get("rule_code") or item.get("code") or "").strip()
    name = str(item.get("rule_name") or item.get("name") or code).strip()
    if not code:
        code = f"DOC_{severity}_{_slug(name)}_{index}"
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
        "priority": int(item.get("priority") or 100),
        "rule_type": str(item.get("rule_type") or "RISK_LEVEL"),
        "source_ref": item.get("source_ref") or item.get("evidence_source"),
        "applies_to": _clean_list(item.get("applies_to") or item.get("applicable_population")),
        "review_status": "EXPERT_CONFIRMED"
        if confirm
        else str(item.get("review_status") or item.get("expert_review_status") or "EXPERT_REVIEW_DRAFT"),
        "message": message,
        "condition": {
            "path": path,
            "op": operator,
            "value": item.get("value"),
            "version": item.get("version"),
        },
        "contraindications": _clean_list(item.get("contraindications")),
        "intensity_cap": item.get("intensity_cap"),
        "is_active": True,
    }


def import_risk_rules(
    db: Session,
    path: str | Path,
    actor_id: int | None = None,
    confirm: bool = False,
) -> dict[str, int]:
    source_path = Path(path)
    items = _load_items(source_path)
    created = updated = skipped_r0 = errors = 0
    seen_codes: set[str] = set()
    for index, item in enumerate(items, start=1):
        try:
            normalized = _normalize_rule(item, index, confirm=confirm)
        except ValueError:
            errors += 1
            continue
        if normalized is None:
            skipped_r0 += 1
            continue
        seen_codes.add(normalized["code"])
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
    deactivated_old = 0
    for rule in db.scalars(
        select(RiskRuleConfig).where(
            RiskRuleConfig.is_active.is_(True),
            RiskRuleConfig.created_by.is_(None),
            RiskRuleConfig.code.not_in(seen_codes),
        )
    ):
        rule.is_active = False
        rule.version += 1
        deactivated_old += 1
    AuditService(db).record(
        action="IMPORT_RISK_RULES",
        resource_type="RiskRuleConfig",
        actor_id=actor_id,
        metadata={
            "source_path": str(source_path),
            "confirm": confirm,
            "review_status": "EXPERT_CONFIRMED" if confirm else "SOURCE_STATUS",
            "created": created,
            "updated": updated,
            "imported": created + updated,
            "skipped_r0": skipped_r0,
            "deactivated_old": deactivated_old,
            "errors": errors,
        },
    )
    db.commit()
    return {
        "created": created,
        "updated": updated,
        "imported": created + updated,
        "skipped_r0": skipped_r0,
        "skipped": skipped_r0,
        "deactivated_old": deactivated_old,
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 docs 专家规则库 JSON，R0 规则将被跳过。")
    parser.add_argument("path", help="风险规则 JSON 文件路径。")
    parser.add_argument("--confirm", action="store_true", help="按本轮专家确认结论导入为 EXPERT_CONFIRMED。")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = import_risk_rules(db, args.path, confirm=args.confirm)
        print(
            "Imported risk rules: "
            f"created={result['created']}, updated={result['updated']}, "
            f"skipped_r0={result['skipped_r0']}, "
            f"deactivated_old={result['deactivated_old']}, errors={result['errors']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
