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
from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.services.knowledge_service import KnowledgeVectorIndexService, _chunk_text


def _load_items(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items", [])
    if not isinstance(data, list):
        raise ValueError("知识库导入文件必须是 JSON 数组，或包含 items 数组的对象。")
    return data


def _clean_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise ValueError("tags 必须是字符串或数组。")


def import_knowledge_documents(db: Session, path: str | Path, created_by: int | None = None) -> dict[str, int]:
    items = _load_items(Path(path))
    created = 0
    updated = 0
    chunk_count = 0

    for index, item in enumerate(items, start=1):
        title = str(item.get("title", "")).strip()
        category = str(item.get("category", "")).strip()
        content = str(item.get("content", "")).strip()
        source = str(item["source"]).strip() if item.get("source") else None
        tags = _clean_tags(item.get("tags"))
        if not title or not category or not content:
            raise ValueError(f"第 {index} 条知识缺少 title、category 或 content。")

        document = db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.title == title))
        if document is None:
            document = KnowledgeDocument(
                title=title,
                category=category,
                source=source,
                status="ACTIVE",
                created_by=created_by,
            )
            db.add(document)
            db.flush()
            created += 1
        else:
            document.category = category
            document.source = source
            document.status = "ACTIVE"
            old_chunks = db.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
            ).all()
            for old_chunk in old_chunks:
                db.delete(old_chunk)
            if old_chunks:
                db.flush()
            updated += 1

        chunks = _chunk_text(content)
        for chunk_index, chunk in enumerate(chunks):
            db.add(
                KnowledgeChunk(
                    document_id=document.id,
                    chunk_index=chunk_index,
                    content=chunk,
                    tags=tags,
                    embedding_ref=None,
                )
            )
        chunk_count += len(chunks)

    db.commit()
    try:
        KnowledgeVectorIndexService(db).index_all()
    except Exception:
        pass
    return {"created": created, "updated": updated, "chunks": chunk_count}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 RAG 知识库 JSON 文档。")
    parser.add_argument("path", help="JSON 文件路径，数组元素需包含 title/category/content/tags/source。")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = import_knowledge_documents(db, args.path)
        print(
            f"Imported knowledge documents: created={result['created']}, "
            f"updated={result['updated']}, chunks={result['chunks']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
