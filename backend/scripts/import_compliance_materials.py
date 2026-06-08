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
from app.models.template import ComplianceDocument


def _load_documents(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("documents", [])
    if not isinstance(data, list):
        raise ValueError("合规材料导入文件必须是 JSON 数组，或包含 documents 数组的对象。")
    return data


def _clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()]


def upsert_compliance_document(
    db: Session,
    item: dict[str, Any],
    *,
    confirmed: bool = False,
) -> tuple[ComplianceDocument, bool]:
    code = str(item.get("doc_code") or item.get("code") or "").strip()
    title = str(item.get("title") or "").strip()
    text = str(item.get("text") or "").strip()
    if not code or not title or not text:
        raise ValueError("合规材料缺少 doc_code/code、title 或 text。")

    document = db.scalar(select(ComplianceDocument).where(ComplianceDocument.code == code))
    created = document is None
    if document is None:
        document = ComplianceDocument(code=code, title=title, text=text)
        db.add(document)

    document.title = title
    document.version = str(item.get("version") or "v0.1").strip()
    document.effective_date = str(item["effective_date"]).strip() if item.get("effective_date") else None
    document.applicable_scope = str(item["applicable_scope"]).strip() if item.get("applicable_scope") else None
    document.text = text
    document.short_notice = str(item["short_notice"]).strip() if item.get("short_notice") else None
    document.checkbox_text = str(item["checkbox_text"]).strip() if item.get("checkbox_text") else None
    document.evidence_refs = _clean_list(item.get("evidence_refs"))
    if confirmed:
        document.pending_confirmation = []
        document.review_status = "CONFIRMED"
        document.status = "ACTIVE"
    else:
        document.pending_confirmation = _clean_list(item.get("pending_confirmation"))
        document.review_status = str(item.get("review_status") or "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW").strip()
        document.status = str(item.get("status") or "ACTIVE").strip()
    return document, created


def import_compliance_materials(db: Session, path: str | Path, confirmed: bool = False) -> dict[str, int]:
    created = updated = skipped = errors = confirmed_count = 0
    for item in _load_documents(Path(path)):
        try:
            _, was_created = upsert_compliance_document(db, item, confirmed=confirmed)
        except ValueError:
            errors += 1
            continue
        if confirmed:
            confirmed_count += 1
        if was_created:
            created += 1
        else:
            updated += 1
    db.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "confirmed": confirmed_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="导入合规材料 JSON。")
    parser.add_argument("path", help="合规材料 JSON 文件路径。")
    parser.add_argument("--confirmed", action="store_true", help="按法务、伦理、运动医学专家已确认版本导入。")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = import_compliance_materials(db, args.path, confirmed=args.confirmed)
        print(
            "Imported compliance materials: "
            f"created={result['created']}, updated={result['updated']}, "
            f"skipped={result['skipped']}, errors={result['errors']}, confirmed={result['confirmed']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
