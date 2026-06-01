import json

from app.services.knowledge_service import KnowledgeRetrievalService
from scripts.import_rag_data import import_rag_data


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
    allowlist.write_text(str(doc) + "\n", encoding="utf-8")
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
    assert result["chunks"] >= 1
    assert evidence
    assert evidence[0].document_title == "CDC Older Adults Physical Activity"
    assert evidence[0].source_type == "网页摘要"
    assert evidence[0].version == "accessed 2026-06-01"
    assert evidence[0].section in {"Older Adults", "Safety"}
