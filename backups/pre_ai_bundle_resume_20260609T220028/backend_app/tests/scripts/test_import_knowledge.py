import json
from pathlib import Path

from sqlalchemy import select

from app.models.template import KnowledgeChunk, KnowledgeDocument
from scripts.import_knowledge import import_knowledge_documents


def write_payload(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_import_knowledge_documents_creates_documents_and_chunks(db_session, tmp_path):
    source = tmp_path / "knowledge.json"
    write_payload(
        source,
        json.dumps(
            [
                {
                    "title": "高血压运动干预指南",
                    "category": "慢病运动",
                    "source": "专家共识",
                    "tags": ["高血压", "R2"],
                    "content": "高血压稳定期建议低强度起步。\n避免憋气和大负荷力量训练。",
                },
                {
                    "title": "八段锦动作说明",
                    "category": "传统功法",
                    "tags": ["八段锦", "R1"],
                    "content": "八段锦适合低冲击运动干预。",
                },
            ],
            ensure_ascii=False,
        ),
    )

    result = import_knowledge_documents(db_session, source)

    documents = db_session.scalars(select(KnowledgeDocument).order_by(KnowledgeDocument.title)).all()
    chunks = db_session.scalars(select(KnowledgeChunk)).all()
    assert result == {"created": 2, "updated": 0, "chunks": 2}
    assert [document.title for document in documents] == ["八段锦动作说明", "高血压运动干预指南"]
    assert len(chunks) == 2
    assert all(document.status == "ACTIVE" for document in documents)


def test_import_knowledge_documents_updates_existing_document_by_title(db_session, tmp_path):
    source = tmp_path / "knowledge.json"
    write_payload(
        source,
        json.dumps(
            [
                {
                    "title": "高血压运动干预指南",
                    "category": "慢病运动",
                    "tags": ["高血压"],
                    "content": "旧内容。",
                }
            ],
            ensure_ascii=False,
        ),
    )
    import_knowledge_documents(db_session, source)
    write_payload(
        source,
        json.dumps(
            [
                {
                    "title": "高血压运动干预指南",
                    "category": "慢病运动",
                    "source": "更新版指南",
                    "tags": ["高血压", "R2"],
                    "content": "更新后的低强度起步建议。",
                }
            ],
            ensure_ascii=False,
        ),
    )

    result = import_knowledge_documents(db_session, source)

    documents = db_session.scalars(select(KnowledgeDocument)).all()
    chunks = db_session.scalars(select(KnowledgeChunk)).all()
    assert result == {"created": 0, "updated": 1, "chunks": 1}
    assert len(documents) == 1
    assert documents[0].source == "更新版指南"
    assert len(chunks) == 1
    assert chunks[0].content == "更新后的低强度起步建议。"
    assert chunks[0].tags == ["高血压", "R2"]
