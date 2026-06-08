import argparse
import json
import re
import zipfile
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.core.config import settings
from app.services.ocr_service import PaddleOCRService
from app.services.knowledge_service import KnowledgeVectorIndexService, _chunk_text, _infer_section


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag in {"p", "br", "div", "section", "article", "h1", "h2", "h3", "li"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if text:
            self.parts.append(text)

    def text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", " ".join(self.parts)).strip()


def _read_allowlist(path: Path, rag_root: Path) -> list[tuple[str, Path, bool]]:
    entries: list[tuple[str, Path, bool]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        raw_path = Path(line)
        if raw_path.is_absolute():
            parts = raw_path.parts
            if "rag_data" in parts:
                rag_index = parts.index("rag_data")
                resolved = rag_root.joinpath(*parts[rag_index + 1 :])
            else:
                resolved = raw_path
            entries.append((line, resolved, True))
        else:
            entries.append((line, rag_root / raw_path, False))
    return entries


def _load_catalog(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items", data.get("sources", []))
    return {str(item.get("source_id")): item for item in data if item.get("source_id")}


def _source_id_from_path(path: Path) -> str | None:
    match = re.search(r"(SRC\d*-\d+)", path.name)
    if match:
        return match.group(1)
    return None


def _extract_year(*values: Any) -> str | None:
    for value in values:
        if not value:
            continue
        match = re.search(r"(19|20)\d{2}", str(value))
        if match:
            return match.group(0)
    return None


def _new_import_batch_id() -> str:
    return f"rag-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}"


def _extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def _extract_legacy_doc_text(path: Path) -> str:
    data = path.read_bytes()
    text = data.decode("utf-16le", errors="ignore")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]+", "\n", text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _extract_pdf_text(path: Path) -> tuple[str, list[tuple[int | None, int | None]]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF 解析需要安装 pypdf；扫描件 OCR 可在服务器启用 PaddleOCR。") from exc
    reader = PdfReader(str(path))
    pages: list[str] = []
    page_ranges: list[tuple[int | None, int | None]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(f"# Page {index}\n{text}")
            page_ranges.append((index, index))
    return "\n\n".join(pages), page_ranges


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}


def _extract_text(path: Path, ocr_enabled: bool | None = None) -> tuple[str, list[tuple[int | None, int | None]]]:
    suffix = path.suffix.lower()
    use_ocr = settings.OCR_ENABLED if ocr_enabled is None else ocr_enabled
    if suffix in {".md", ".txt", ".csv"}:
        return path.read_text(encoding="utf-8", errors="ignore"), []
    if suffix in {".html", ".htm"}:
        parser = _HTMLTextExtractor()
        parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
        return parser.text(), []
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return json.dumps(payload, ensure_ascii=False, indent=2), []
    if suffix == ".docx":
        return _extract_docx_text(path), []
    if suffix == ".doc":
        return _extract_legacy_doc_text(path), []
    if suffix == ".pdf":
        text, page_ranges = _extract_pdf_text(path)
        if text.strip() or not use_ocr:
            return text, page_ranges
        return PaddleOCRService().extract_pdf_text(path)
    if suffix in IMAGE_SUFFIXES:
        if not use_ocr:
            return "", []
        return PaddleOCRService().extract_image_text(path), []
    raise RuntimeError(f"暂不支持解析文件类型：{suffix}")


def _title_for(path: Path, metadata: dict[str, Any]) -> str:
    return str(metadata.get("title") or path.stem).strip()


def _tags_for(path: Path, metadata: dict[str, Any]) -> list[str]:
    tags = metadata.get("knowledge_tags") or []
    if isinstance(tags, str):
        tags = [tags]
    folder_tag = path.parent.name
    return [str(tag).strip() for tag in [*tags, folder_tag] if str(tag).strip()]


def _upsert_document(
    db: Session,
    path: Path,
    content: str,
    metadata: dict[str, Any],
    page_ranges: list[tuple[int | None, int | None]],
    created_by: int | None,
    import_batch_id: str,
) -> tuple[int, int, int]:
    title = _title_for(path, metadata)
    document = db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.file_path == str(path)))
    created = 0
    updated = 0
    chunks = _chunk_text(content, max_chars=900)
    tags = _tags_for(path, metadata)
    if document is None:
        document = KnowledgeDocument(title=title, category=path.parent.name, file_path=str(path), created_by=created_by)
        db.add(document)
        db.flush()
        created = 1
    else:
        updated = 1
        existing_chunks = db.scalars(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document.id)
            .order_by(KnowledgeChunk.chunk_index)
        ).all()
        if [chunk.content for chunk in existing_chunks] == chunks:
            for index, chunk in enumerate(existing_chunks):
                page_start, page_end = page_ranges[index] if index < len(page_ranges) else (None, None)
                chunk.chunk_index = index
                chunk.tags = tags
                chunk.source_section = _infer_section(chunk.content)
                chunk.page_start = page_start
                chunk.page_end = page_end
            document.title = title
            document.category = path.parent.name
            document.source = str(metadata.get("official_url") or metadata.get("download_url") or path)
            document.source_type = str(metadata.get("document_type") or path.suffix.lstrip(".") or "file")
            document.version = str(metadata.get("version") or metadata.get("published_date") or "").strip() or None
            document.published_year = _extract_year(metadata.get("published_date"), metadata.get("version"), path.name)
            document.file_path = str(path)
            document.import_batch_id = import_batch_id
            document.credibility_level = (
                str(metadata.get("credibility_level") or metadata.get("risk_level") or "").strip() or None
            )
            document.skipped_reason = None
            document.status = "ACTIVE"
            return created, updated, len(chunks)
        db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))

    document.title = title
    document.category = path.parent.name
    document.source = str(metadata.get("official_url") or metadata.get("download_url") or path)
    document.source_type = str(metadata.get("document_type") or path.suffix.lstrip(".") or "file")
    document.version = str(metadata.get("version") or metadata.get("published_date") or "").strip() or None
    document.published_year = _extract_year(metadata.get("published_date"), metadata.get("version"), path.name)
    document.file_path = str(path)
    document.import_batch_id = import_batch_id
    document.credibility_level = str(metadata.get("credibility_level") or metadata.get("risk_level") or "").strip() or None
    document.skipped_reason = None
    document.status = "ACTIVE"

    for index, chunk in enumerate(chunks):
        page_start, page_end = page_ranges[index] if index < len(page_ranges) else (None, None)
        db.add(
            KnowledgeChunk(
                document_id=document.id,
                chunk_index=index,
                content=chunk,
                tags=tags,
                source_section=_infer_section(chunk),
                page_start=page_start,
                page_end=page_end,
                embedding_ref=None,
            )
        )
    return created, updated, len(chunks)


def _upsert_skipped_document(
    db: Session,
    path: Path,
    metadata: dict[str, Any],
    created_by: int | None,
    import_batch_id: str,
    reason: str,
) -> None:
    title = _title_for(path, metadata)
    document = db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.file_path == str(path)))
    if document is None:
        document = KnowledgeDocument(title=title, category=path.parent.name, file_path=str(path), created_by=created_by)
        db.add(document)
        db.flush()
    else:
        db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))

    document.title = title
    document.category = path.parent.name
    document.source = str(metadata.get("official_url") or metadata.get("download_url") or path)
    document.source_type = str(metadata.get("document_type") or path.suffix.lstrip(".") or "file")
    document.version = str(metadata.get("version") or metadata.get("published_date") or "").strip() or None
    document.published_year = _extract_year(metadata.get("published_date"), metadata.get("version"), path.name)
    document.file_path = str(path)
    document.import_batch_id = import_batch_id
    document.credibility_level = str(metadata.get("credibility_level") or metadata.get("risk_level") or "").strip() or None
    document.status = "SKIPPED"
    document.skipped_reason = reason[:500]


def import_rag_data(
    db: Session,
    rag_root: str | Path,
    allowlist_path: str | Path | None = None,
    catalog_path: str | Path | None = None,
    build_index: bool = True,
    created_by: int | None = None,
    strict: bool = False,
) -> dict[str, int | str]:
    root = Path(rag_root)
    allowlist = Path(allowlist_path) if allowlist_path else root / "_manifests" / "rag_ingest_allowlist.txt"
    catalog = _load_catalog(Path(catalog_path) if catalog_path else None)
    import_batch_id = _new_import_batch_id()
    created = updated = skipped = errors = chunks = 0
    for raw_entry, path, is_absolute in _read_allowlist(allowlist, root):
        metadata = catalog.get(_source_id_from_path(path) or "", {})
        if is_absolute and strict:
            errors += 1
            skipped += 1
            _upsert_skipped_document(
                db,
                path=path,
                metadata=metadata,
                created_by=created_by,
                import_batch_id=import_batch_id,
                reason=f"allowlist contains absolute path: {raw_entry}",
            )
            continue
        if not path.exists():
            skipped += 1
            _upsert_skipped_document(
                db,
                path=path,
                metadata=metadata,
                created_by=created_by,
                import_batch_id=import_batch_id,
                reason="allowlist file missing",
            )
            continue
        try:
            content, page_ranges = _extract_text(path)
            if not content.strip():
                raise RuntimeError("文件未解析出文本；如为扫描件，请启用 PaddleOCR 后重建索引。")
            was_created, was_updated, chunk_count = _upsert_document(
                db, path, content, metadata, page_ranges, created_by, import_batch_id
            )
            created += was_created
            updated += was_updated
            chunks += chunk_count
        except Exception as exc:
            errors += 1
            skipped += 1
            _upsert_skipped_document(
                db,
                path=path,
                metadata=metadata,
                created_by=created_by,
                import_batch_id=import_batch_id,
                reason=str(exc),
            )
    db.commit()
    if build_index:
        try:
            KnowledgeVectorIndexService(db).index_all()
        except Exception as exc:
            errors += 1
            if strict:
                raise RuntimeError(f"RAG index build failed: {exc}") from exc
    result = {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "chunks": chunks,
        "import_batch_id": import_batch_id,
    }
    if strict and (skipped > 0 or errors > 0 or chunks == 0):
        raise RuntimeError(f"RAG strict import failed: skipped={skipped}, errors={errors}, chunks={chunks}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="按 rag_data allowlist 解析、切片并导入 RAG 知识库。")
    parser.add_argument("--rag-root", default="../rag_data", help="rag_data 根目录。")
    parser.add_argument("--allowlist", default=None, help="allowlist 路径，默认使用 rag_data/_manifests/rag_ingest_allowlist.txt。")
    parser.add_argument("--catalog", default="../docs/knowledge_source_catalog_v0_2.json", help="知识来源清单 JSON。")
    parser.add_argument("--no-index", action="store_true", help="只导入数据库切片，不重建向量索引。")
    parser.add_argument("--strict", action="store_true", help="存在 skipped/errors 或未生成 chunks 时以非 0 状态退出。")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = import_rag_data(
            db,
            rag_root=Path(args.rag_root).resolve(),
            allowlist_path=Path(args.allowlist).resolve() if args.allowlist else None,
            catalog_path=Path(args.catalog).resolve() if args.catalog else None,
            build_index=not args.no_index,
            strict=args.strict,
        )
        print(
            "Imported RAG data: "
            f"created={result['created']}, updated={result['updated']}, skipped={result['skipped']}, "
            f"errors={result['errors']}, chunks={result['chunks']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
