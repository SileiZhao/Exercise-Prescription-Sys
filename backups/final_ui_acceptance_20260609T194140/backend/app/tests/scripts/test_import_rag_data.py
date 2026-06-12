import json
import pytest
from sqlalchemy import select

from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.services.knowledge_service import KnowledgeRetrievalService
import scripts.import_rag_data as rag_import
from scripts.import_rag_data import import_rag_data
from scripts.import_rag_data import _extract_text


def test_import_rag_data_reads_allowlist_records_metadata_and_retrieves_sources(db_session, tmp_path):
    rag_root = tmp_path / "rag_data"
    source_dir = rag_root / "90_web_archives"
    source_dir.mkdir(parents=True)
    doc = source_dir / "SRC2-010_CDC_Physical_Activity_Basics_Older_Adults_summary.md"
    doc.write_text(
        "# Older Adults\n\n高血压老年人运动应从低强度开始，监测 RPE 和血压。\n\n## Safety\n出现胸痛应停止。",
        encoding="utf-8",
    )
    allowlist = rag_root / "_manifests" / "rag_ingest_allowlist.txt"
    allowlist.parent.mkdir(parents=True)
    missing = source_dir / "missing.pdf"
    allowlist.write_text(str(doc) + "\n" + str(missing) + "\n", encoding="utf-8")
    catalog = tmp_path / "catalog.json"
    catalog.write_text(
        json.dumps(
            [
                {
                    "source_id": "SRC2-010",
                    "title": "CDC Older Adults Physical Activity",
                    "document_type": "网页摘要",
                    "version": "accessed 2026-06-01",
                    "published_date": "2026-06-01",
                    "knowledge_tags": ["R2", "老年", "高血压"],
                    "risk_level": "medium",
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    result = import_rag_data(
        db_session,
        rag_root=rag_root,
        allowlist_path=allowlist,
        catalog_path=catalog,
        build_index=False,
    )

    evidence = KnowledgeRetrievalService(db_session).retrieve("高血压 老年 RPE", tags=["R2"], limit=3)

    assert result["created"] == 1
    assert result["skipped"] == 1
    assert result["chunks"] >= 1
    assert result["import_batch_id"]
    assert evidence
    assert evidence[0].document_title == "CDC Older Adults Physical Activity"
    assert evidence[0].source_type == "网页摘要"
    assert evidence[0].version == "accessed 2026-06-01"
    assert evidence[0].section in {"Older Adults", "Safety"}
    assert evidence[0].credibility_level == "medium"

    documents = db_session.scalars(select(KnowledgeDocument)).all()
    skipped = [document for document in documents if document.status == "SKIPPED"]
    assert skipped
    assert skipped[0].skipped_reason == "allowlist file missing"
    assert skipped[0].import_batch_id == result["import_batch_id"]


def test_import_rag_data_strict_fails_when_allowlist_file_missing(db_session, tmp_path):
    rag_root = tmp_path / "rag_data"
    manifest = rag_root / "_manifests"
    manifest.mkdir(parents=True)
    allowlist = manifest / "rag_ingest_allowlist.txt"
    allowlist.write_text("00_core_guidelines/missing.pdf\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="skipped=1"):
        import_rag_data(
            db_session,
            rag_root=rag_root,
            allowlist_path=allowlist,
            build_index=False,
            strict=True,
        )


def test_import_rag_data_uses_ocr_when_pdf_text_is_empty(db_session, tmp_path, monkeypatch):
    rag_root = tmp_path / "rag_data"
    source_dir = rag_root / "00_core_guidelines"
    source_dir.mkdir(parents=True)
    pdf = source_dir / "scan.pdf"
    pdf.write_bytes(b"%PDF fake")
    allowlist = rag_root / "_manifests" / "rag_ingest_allowlist.txt"
    allowlist.parent.mkdir(parents=True)
    allowlist.write_text("00_core_guidelines/scan.pdf\n", encoding="utf-8")

    class FakeOCRService:
        def extract_pdf_text(self, path):
            return "扫描件文本", [(1, 1)]

    monkeypatch.setattr(rag_import, "_extract_pdf_text", lambda path: ("", []))
    monkeypatch.setattr(rag_import.settings, "OCR_ENABLED", True)
    monkeypatch.setattr(rag_import, "PaddleOCRService", lambda: FakeOCRService(), raising=False)

    result = import_rag_data(
        db_session,
        rag_root=rag_root,
        allowlist_path=allowlist,
        build_index=False,
        strict=True,
    )

    document = db_session.scalar(select(KnowledgeDocument).where(KnowledgeDocument.file_path == str(pdf)))
    assert result["chunks"] > 0
    assert document.status == "ACTIVE"


def test_import_rag_data_lightweight_profile_defers_pdf_without_ocr(db_session, tmp_path, monkeypatch):
    rag_root = tmp_path / "rag_data"
    source_dir = rag_root / "90_web_archives"
    source_dir.mkdir(parents=True)
    summary = source_dir / "SRC2-010_CDC_Physical_Activity_Basics_Older_Adults_summary.md"
    summary.write_text("老年人运动建议从低强度开始，监测 RPE。", encoding="utf-8")
    pdf_dir = rag_root / "00_core_guidelines"
    pdf_dir.mkdir(parents=True)
    pdf = pdf_dir / "WHO_2020_physical_activity_sedentary_behaviour_guidelines.pdf"
    pdf.write_bytes(b"%PDF fake")
    allowlist = rag_root / "_manifests" / "rag_ingest_allowlist.txt"
    allowlist.parent.mkdir(parents=True)
    allowlist.write_text(
        "\n".join(
            [
                "90_web_archives/SRC2-010_CDC_Physical_Activity_Basics_Older_Adults_summary.md",
                "00_core_guidelines/WHO_2020_physical_activity_sedentary_behaviour_guidelines.pdf",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        rag_import,
        "_extract_pdf_text",
        lambda path: pytest.fail("lightweight profile must not parse PDFs"),
    )

    result = import_rag_data(
        db_session,
        rag_root=rag_root,
        allowlist_path=allowlist,
        build_index=False,
        strict=True,
        profile="lightweight",
    )

    active = db_session.scalars(select(KnowledgeDocument).where(KnowledgeDocument.status == "ACTIVE")).all()
    assert result["created"] == 1
    assert result["deferred"] == 1
    assert result["skipped"] == 0
    assert result["errors"] == 0
    assert result["chunks"] >= 1
    assert result["profile"] == "lightweight"
    assert [document.file_path for document in active] == [str(summary)]


def test_import_rag_data_preserves_indexed_chunks_when_content_is_unchanged(db_session, tmp_path):
    rag_root = tmp_path / "rag_data"
    source_dir = rag_root / "00_core_guidelines"
    source_dir.mkdir(parents=True)
    doc = source_dir / "guideline.md"
    doc.write_text("运动处方\n\n高血压患者应循序渐进。", encoding="utf-8")
    allowlist = rag_root / "_manifests" / "rag_ingest_allowlist.txt"
    allowlist.parent.mkdir(parents=True)
    allowlist.write_text("00_core_guidelines/guideline.md\n", encoding="utf-8")

    import_rag_data(db_session, rag_root=rag_root, allowlist_path=allowlist, build_index=False)
    chunk = db_session.scalar(select(KnowledgeChunk))
    chunk.embedding_ref = "qdrant:exercise_prescription_knowledge:demo"
    chunk_id = chunk.id
    db_session.commit()

    result = import_rag_data(db_session, rag_root=rag_root, allowlist_path=allowlist, build_index=False)

    preserved_chunk = db_session.scalar(select(KnowledgeChunk))
    assert result["updated"] == 1
    assert result["chunks"] == 1
    assert preserved_chunk.id == chunk_id
    assert preserved_chunk.embedding_ref == "qdrant:exercise_prescription_knowledge:demo"


def test_extract_text_supports_legacy_word_doc(tmp_path):
    doc = tmp_path / "legacy.doc"
    doc.write_bytes(b"\xd0\xcf\x11\xe0" + "健身气功运动处方\n研制指南".encode("utf-16le"))

    text, page_ranges = _extract_text(doc)

    assert "健身气功运动处方" in text
    assert page_ranges == []
