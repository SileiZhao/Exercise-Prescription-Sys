import pytest

from app.models.template import KnowledgeChunk
from app.services.knowledge_service import (
    KnowledgeIngestionService,
    KnowledgeRetrievalService,
    KnowledgeVectorIndexService,
    _chunk_text,
)


class FakeVectorStore:
    def __init__(self):
        self.points = {}
        self.upsert_calls = []
        self.fail_search = False

    def upsert_chunks(self, chunks):
        self.upsert_calls.append(list(chunks))
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


class BatchEmbeddingProvider:
    def __init__(self):
        self.calls = []

    def embed(self, text: str):
        raise AssertionError("index_all should call embed_many for chunk batches")

    def embed_many(self, texts: list[str]):
        self.calls.append(list(texts))
        return [[float(index), 0.0, 0.0] for index, _ in enumerate(texts, start=1)]


class QueryEmbeddingProvider:
    def embed(self, text: str):
        return [1.0, 0.0, 0.0]

    def embed_many(self, texts: list[str]):
        return [[1.0, 0.0, 0.0] for _ in texts]


def test_chunk_text_splits_single_long_paragraph_into_bounded_chunks():
    content = "运动处方" * 2000

    chunks = _chunk_text(content, max_chars=900)

    assert len(chunks) > 1
    assert all(len(chunk) <= 900 for chunk in chunks)


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
    assert results[0].retrieval_mode == "vector"
    assert results[0].document_status == "ACTIVE"


def test_vector_index_service_upserts_chunks_in_batches(db_session, monkeypatch):
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    for index in range(3):
        KnowledgeIngestionService(db_session).ingest_text(
            title=f"批量索引资料 {index}",
            category="批量索引",
            content=f"第 {index} 条运动处方资料。",
            tags=["批量"],
            created_by=None,
        )
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_INDEX_BATCH_SIZE", 2)
    store = FakeVectorStore()

    result = KnowledgeVectorIndexService(db_session, vector_store=store).index_all()

    chunks = db_session.query(KnowledgeChunk).order_by(KnowledgeChunk.id).all()
    assert result == {"indexed": 3, "skipped": 0}
    assert [len(call) for call in store.upsert_calls] == [2, 1]
    assert all(chunk.embedding_ref == f"qdrant:exercise_prescription_knowledge:{chunk.id}" for chunk in chunks)


def test_vector_index_service_embeds_chunks_in_batches(db_session, monkeypatch):
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    for index in range(3):
        KnowledgeIngestionService(db_session).ingest_text(
            title=f"批量向量资料 {index}",
            category="批量向量",
            content=f"第 {index} 条运动处方资料。",
            tags=["批量"],
            created_by=None,
        )
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_INDEX_BATCH_SIZE", 2)
    embedding_provider = BatchEmbeddingProvider()

    result = KnowledgeVectorIndexService(
        db_session,
        embedding_provider=embedding_provider,
        vector_store=FakeVectorStore(),
    ).index_all()

    assert result == {"indexed": 3, "skipped": 0}
    assert [len(call) for call in embedding_provider.calls] == [2, 1]


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
    assert results[0].retrieval_mode == "keyword_fallback"
    assert results[0].fallback_reason == "vector store unavailable"


def test_vector_retrieval_does_not_mark_unindexed_active_chunks_as_vector_results(db_session, monkeypatch):
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    KnowledgeIngestionService(db_session).ingest_text(
        title="未完成向量化资料",
        category="知识库",
        content="只有完成向量化的 ACTIVE 切片才能进入向量检索结果。",
        tags=["向量化"],
        created_by=None,
    )
    chunk = db_session.query(KnowledgeChunk).one()
    assert chunk.embedding_ref is None
    store = FakeVectorStore()
    store.points[chunk.id] = {"vector": [1.0, 0.0, 0.0], "payload": {"tags": ["向量化"]}}
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)

    results = KnowledgeRetrievalService(
        db_session,
        embedding_provider=QueryEmbeddingProvider(),
        vector_store=store,
    ).retrieve(query="向量化", tags=["向量化"], limit=3)

    assert results
    assert results[0].retrieval_mode == "keyword_fallback"
    assert results[0].fallback_reason == "vector_chunks_not_indexed_or_not_active"


def test_keyword_retrieval_marks_index_failed_documents_as_keyword_only(db_session, monkeypatch):
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", False)
    document = KnowledgeIngestionService(db_session).ingest_text(
        title="索引失败指南",
        category="慢病运动",
        content="索引失败资料仍可通过关键词召回，但必须明确标注。",
        tags=["索引失败"],
        created_by=None,
    )
    document.status = "INDEX_FAILED"
    document.skipped_reason = "索引失败：向量服务不可用"
    db_session.commit()

    results = KnowledgeRetrievalService(db_session).retrieve(
        query="索引失败 关键词",
        tags=["索引失败"],
        limit=3,
    )

    assert results
    assert results[0].document_title == "索引失败指南"
    assert results[0].retrieval_mode == "keyword"
    assert results[0].document_status == "INDEX_FAILED"
    assert results[0].document_skipped_reason == "索引失败：向量服务不可用"


def test_knowledge_retrieval_returns_source_metadata(db_session):
    KnowledgeIngestionService(db_session).ingest_text(
        title="WHO 身体活动指南",
        category="核心指南",
        content="# Adults\n成年人每周应累计足量中等强度身体活动。",
        tags=["WHO", "R0"],
        created_by=None,
        source_type="指南",
        version="2020",
        published_year="2020",
        file_path="rag_data/who.pdf",
        import_batch_id="batch-test",
        credibility_level="high",
    )

    results = KnowledgeRetrievalService(db_session).retrieve("成年人 身体活动", tags=["WHO"], limit=1)

    assert results[0].source_type == "指南"
    assert results[0].version == "2020"
    assert results[0].section == "Adults"
    assert results[0].credibility_level == "high"
