import re
from hashlib import sha256
from math import sqrt
from typing import Protocol

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.services.audit_service import AuditService


class RetrievedEvidence(BaseModel):
    document_id: int
    document_title: str
    chunk_id: int
    content: str
    tags: list[str]
    score: float
    source_type: str | None = None
    version: str | None = None
    section: str | None = None
    page_start: int | None = None
    page_end: int | None = None


class EmbeddingProvider(Protocol):
    def embed(self, text: str) -> list[float]:
        ...


class KnowledgeVectorStore(Protocol):
    def upsert_chunks(self, chunks: list[tuple[int, list[float], dict]]) -> None:
        ...

    def search(self, query_vector: list[float], tags: list[str], limit: int) -> list[tuple[int, float]]:
        ...


class HashEmbeddingProvider:
    def __init__(self, dimension: int | None = None):
        self.dimension = dimension or settings.RAG_EMBEDDING_DIMENSION

    def embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        tokens = re.findall(r"[\w\u4e00-\u9fff]+", text.lower())
        for token in tokens:
            digest = sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]


class QdrantKnowledgeVectorStore:
    def __init__(self, url: str | None = None, collection_name: str | None = None, dimension: int | None = None):
        from qdrant_client import QdrantClient

        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self.dimension = dimension or settings.RAG_EMBEDDING_DIMENSION
        self.client = QdrantClient(url=url or settings.QDRANT_URL)

    def _ensure_collection(self) -> None:
        from qdrant_client.models import Distance, VectorParams

        if self.client.collection_exists(self.collection_name):
            return
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(size=self.dimension, distance=Distance.COSINE),
        )

    def upsert_chunks(self, chunks: list[tuple[int, list[float], dict]]) -> None:
        from qdrant_client.models import PointStruct

        if not chunks:
            return
        self._ensure_collection()
        self.client.upsert(
            collection_name=self.collection_name,
            points=[
                PointStruct(id=chunk_id, vector=vector, payload=payload)
                for chunk_id, vector, payload in chunks
            ],
        )

    def search(self, query_vector: list[float], tags: list[str], limit: int) -> list[tuple[int, float]]:
        self._ensure_collection()
        hits = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit,
            with_payload=False,
        )
        return [(int(hit.id), float(hit.score)) for hit in hits]


def _chunk_text(content: str, max_chars: int = 500) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n+", content) if part.strip()]
    if not paragraphs:
        paragraphs = [content.strip()]

    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 1 <= max_chars:
            current = f"{current}\n{paragraph}".strip()
        else:
            if current:
                chunks.append(current)
            current = paragraph
    if current:
        chunks.append(current)
    return chunks


def _infer_section(content: str) -> str | None:
    first_line = next((line.strip() for line in content.splitlines() if line.strip()), "")
    if first_line.startswith("#"):
        return first_line.lstrip("#").strip() or None
    return None


class KnowledgeIngestionService:
    def __init__(
        self,
        db: Session,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: KnowledgeVectorStore | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def ingest_text(
        self,
        title: str,
        category: str,
        content: str,
        tags: list[str],
        created_by: int | None,
        source: str | None = None,
        source_type: str | None = None,
        version: str | None = None,
        published_year: str | None = None,
        file_path: str | None = None,
    ) -> KnowledgeDocument:
        document = KnowledgeDocument(
            title=title,
            category=category,
            source=source,
            source_type=source_type,
            version=version,
            published_year=published_year,
            file_path=file_path,
            created_by=created_by,
        )
        self.db.add(document)
        self.db.flush()

        for index, chunk in enumerate(_chunk_text(content)):
            self.db.add(
                KnowledgeChunk(
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk,
                    tags=tags,
                    source_section=_infer_section(chunk),
                    embedding_ref=None,
                )
            )
        self.db.commit()
        self.db.refresh(document)
        self._index_document_safely(document.id)
        return document

    def list_documents(
        self,
        q: str | None = None,
        category: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        query = select(KnowledgeDocument)
        if q:
            pattern = f"%{q.strip()}%"
            query = query.where(or_(KnowledgeDocument.title.ilike(pattern), KnowledgeDocument.source.ilike(pattern)))
        if category:
            query = query.where(KnowledgeDocument.category == category)
        if status:
            query = query.where(KnowledgeDocument.status == status)

        total = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        documents = list(
            self.db.scalars(
                query.order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        if not documents:
            return [], total

        chunk_rows = self.db.execute(
            select(KnowledgeChunk.document_id, func.count(KnowledgeChunk.id))
            .where(KnowledgeChunk.document_id.in_([document.id for document in documents]))
            .group_by(KnowledgeChunk.document_id)
        ).all()
        chunk_counts = {document_id: count for document_id, count in chunk_rows}
        items = [
            {
                "id": document.id,
                "title": document.title,
                "category": document.category,
                "source": document.source,
                "source_type": document.source_type,
                "version": document.version,
                "published_year": document.published_year,
                "file_path": document.file_path,
                "status": document.status,
                "created_at": document.created_at,
                "chunk_count": chunk_counts.get(document.id, 0),
            }
            for document in documents
        ]
        return items, total

    def update_status(
        self,
        document_id: int,
        status: str,
        actor_id: int | None,
        reason: str | None = None,
    ) -> KnowledgeDocument | None:
        document = self.db.get(KnowledgeDocument, document_id)
        if document is None:
            return None
        document.status = status
        AuditService(self.db).record(
            action="UPDATE_KNOWLEDGE_DOCUMENT_STATUS",
            resource_type="KnowledgeDocument",
            actor_id=actor_id,
            resource_id=str(document.id),
            metadata={
                "status": status,
                "reason": reason,
                "title": document.title,
            },
        )
        self.db.commit()
        self.db.refresh(document)
        if document.status == "ACTIVE":
            self._index_document_safely(document.id)
        return document

    def _index_document_safely(self, document_id: int) -> None:
        if not settings.RAG_VECTOR_SEARCH_ENABLED:
            return
        try:
            KnowledgeVectorIndexService(
                self.db,
                embedding_provider=self.embedding_provider,
                vector_store=self.vector_store,
            ).index_all(document_id=document_id)
        except Exception:
            return


class KnowledgeRetrievalService:
    def __init__(
        self,
        db: Session,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: KnowledgeVectorStore | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider or HashEmbeddingProvider()
        self.vector_store = vector_store

    def retrieve(self, query: str, tags: list[str], limit: int = 5) -> list[RetrievedEvidence]:
        if settings.RAG_VECTOR_SEARCH_ENABLED:
            vector_results = self._retrieve_from_vector_store(query=query, tags=tags, limit=limit)
            if vector_results:
                return vector_results
        return self._retrieve_by_keywords(query=query, tags=tags, limit=limit)

    def _retrieve_from_vector_store(
        self,
        query: str,
        tags: list[str],
        limit: int,
    ) -> list[RetrievedEvidence]:
        store = self.vector_store
        if store is None:
            has_indexed_chunks = self.db.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
                .where(KnowledgeDocument.status == "ACTIVE", KnowledgeChunk.embedding_ref.is_not(None))
            )
            if not has_indexed_chunks:
                return []
            store = QdrantKnowledgeVectorStore()

        try:
            matches = store.search(self.embedding_provider.embed(query), tags=tags, limit=limit)
        except Exception:
            return []
        if not matches:
            return []

        chunk_ids = [chunk_id for chunk_id, _ in matches]
        rows = self.db.execute(
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeDocument.status == "ACTIVE", KnowledgeChunk.id.in_(chunk_ids))
        ).all()
        by_chunk_id = {chunk.id: (chunk, document) for chunk, document in rows}
        tag_set = set(tags)
        results: list[RetrievedEvidence] = []
        for chunk_id, score in matches:
            if chunk_id not in by_chunk_id:
                continue
            chunk, document = by_chunk_id[chunk_id]
            if tags and not tag_set.intersection(set(chunk.tags or [])):
                continue
            results.append(
                RetrievedEvidence(
                    document_id=document.id,
                    document_title=document.title,
                    chunk_id=chunk.id,
                    content=chunk.content,
                    tags=chunk.tags or [],
                    score=score,
                    source_type=document.source_type,
                    version=document.version,
                    section=chunk.source_section,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                )
            )
        return results[:limit]

    def _retrieve_by_keywords(self, query: str, tags: list[str], limit: int) -> list[RetrievedEvidence]:
        query_terms = {term for term in re.split(r"\s+", query.strip()) if term}
        tag_set = set(tags)
        rows = self.db.execute(
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeDocument.status == "ACTIVE")
        ).all()

        results: list[RetrievedEvidence] = []
        for chunk, document in rows:
            chunk_tags = set(chunk.tags or [])
            content = chunk.content
            term_score = sum(1 for term in query_terms if term in content)
            tag_score = len(tag_set.intersection(chunk_tags)) * 2
            score = term_score + tag_score
            if score <= 0:
                continue
            results.append(
                RetrievedEvidence(
                    document_id=document.id,
                    document_title=document.title,
                    chunk_id=chunk.id,
                    content=content,
                    tags=chunk.tags or [],
                    score=float(score),
                    source_type=document.source_type,
                    version=document.version,
                    section=chunk.source_section,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]


class KnowledgeVectorIndexService:
    def __init__(
        self,
        db: Session,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: KnowledgeVectorStore | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider or HashEmbeddingProvider()
        self.vector_store = vector_store

    def index_all(self, document_id: int | None = None) -> dict[str, int]:
        query = (
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeDocument.status == "ACTIVE")
        )
        if document_id is not None:
            query = query.where(KnowledgeDocument.id == document_id)
        rows = self.db.execute(query).all()
        points: list[tuple[int, list[float], dict]] = []
        skipped = 0
        for chunk, document in rows:
            if chunk.embedding_ref:
                skipped += 1
                continue
            vector = self.embedding_provider.embed(chunk.content)
            points.append(
                (
                    chunk.id,
                    vector,
                    {
                        "document_id": document.id,
                        "document_title": document.title,
                        "category": document.category,
                        "tags": chunk.tags or [],
                        "source_type": document.source_type,
                        "version": document.version,
                        "section": chunk.source_section,
                        "page_start": chunk.page_start,
                        "page_end": chunk.page_end,
                    },
                )
            )

        if not points:
            return {"indexed": 0, "skipped": skipped}

        store = self.vector_store or QdrantKnowledgeVectorStore()
        store.upsert_chunks(points)
        for chunk_id, _, _ in points:
            chunk = self.db.get(KnowledgeChunk, chunk_id)
            if chunk is not None:
                chunk.embedding_ref = f"qdrant:{settings.QDRANT_COLLECTION}:{chunk_id}"
        self.db.commit()
        return {"indexed": len(points), "skipped": skipped}
