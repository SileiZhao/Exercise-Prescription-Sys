import pytest

from app.models.template import KnowledgeChunk
from app.services.knowledge_service import (
    KnowledgeIngestionService,
    KnowledgeRetrievalService,
    KnowledgeVectorIndexService,
)


class FakeVectorStore:
    def __init__(self):
        self.points = {}
        self.fail_search = False

    def upsert_chunks(self, chunks):
        for chunk_id, vector, payload in chunks:
            self.points[chunk_id] = {"vector": vector, "payload": payload}

    def search(self, query_vector, tags, limit):
        if self.fail_search:
            raise RuntimeError("vector store unavailable")
        matches = [
            (chunk_id, 0.91)
            for chunk_id, point in self.points.items()
            if set(tags).intersection(set(point["payload"]["tags"]))
        ]
        return matches[:limit]


def test_knowledge_retrieval_returns_evidence_chunks(db_session):
    document = KnowledgeIngestionService(db_session).ingest_text(
        title="高血压运动干预指南",
        category="慢病运动",
        content="高血压稳定期建议低强度起步，避免憋气和大负荷力量训练。八段锦可作为低冲击运动选择。",
        tags=["高血压", "R2", "八段锦"],
        created_by=None,
    )

    results = KnowledgeRetrievalService(db_session).retrieve(
        query="高血压 八段锦 低强度",
        tags=["高血压"],
        limit=3,
    )

    assert document.id is not None
    assert results
    assert results[0].document_title == "高血压运动干预指南"
    assert "低强度" in results[0].content


def test_knowledge_ingestion_indexes_new_document_chunks_when_vector_store_is_available(db_session):
    store = FakeVectorStore()

    document = KnowledgeIngestionService(db_session, vector_store=store).ingest_text(
        title="FITT-VP处方结构要求",
        category="处方原则",
        content="处方必须包含频率、强度、时间、类型、总量和进阶方式。",
        tags=["FITT-VP"],
        created_by=None,
    )

    chunk = db_session.query(KnowledgeChunk).one()
    assert document.id is not None
    assert store.points
    assert chunk.embedding_ref == f"qdrant:exercise_prescription_knowledge:{chunk.id}"


def test_vector_index_service_indexes_chunks_and_retrieval_uses_vector_store(db_session, monkeypatch):
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    KnowledgeIngestionService(db_session).ingest_text(
        title="R3红色风险安全边界",
        category="风险规则",
        content="胸痛、晕厥、严重气短或严重血压异常时不得生成训练处方。",
        tags=["R3", "胸痛"],
        created_by=None,
    )
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)
    store = FakeVectorStore()

    result = KnowledgeVectorIndexService(db_session, vector_store=store).index_all()
    results = KnowledgeRetrievalService(db_session, vector_store=store).retrieve(
        query="安全边界",
        tags=["胸痛"],
        limit=3,
    )

    chunk = db_session.query(KnowledgeChunk).one()
    assert result == {"indexed": 1, "skipped": 0}
    assert chunk.embedding_ref == f"qdrant:exercise_prescription_knowledge:{chunk.id}"
    assert results[0].document_title == "R3红色风险安全边界"
    assert results[0].score == pytest.approx(0.91)


def test_knowledge_retrieval_falls_back_to_keyword_when_vector_store_fails(db_session):
    KnowledgeIngestionService(db_session).ingest_text(
        title="R2高血压运动干预原则",
        category="慢病运动",
        content="稳定高血压用户以低强度有氧为主，避免憋气和大负荷抗阻。",
        tags=["R2", "高血压"],
        created_by=None,
    )
    store = FakeVectorStore()
    KnowledgeVectorIndexService(db_session, vector_store=store).index_all()
    store.fail_search = True

    results = KnowledgeRetrievalService(db_session, vector_store=store).retrieve(
        query="高血压 低强度",
        tags=["高血压"],
        limit=3,
    )

    assert results
    assert results[0].document_title == "R2高血压运动干预原则"
