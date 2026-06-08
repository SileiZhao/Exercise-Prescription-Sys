import re
import logging
from hashlib import sha256
from math import sqrt
from numbers import Real
from typing import Protocol

import httpx
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings, embedding_api_key, embedding_base_url, settings
from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class RetrievedEvidence(BaseModel):
    document_id: int
    document_title: str
    chunk_id: int
    content: str
    tags: list[str]
    score: float
    retrieval_mode: str = "keyword"
    fallback_reason: str | None = None
    document_status: str
    document_skipped_reason: str | None = None
    source_type: str | None = None
    version: str | None = None
    section: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    credibility_level: str | None = None


class EmbeddingProvider(Protocol):
    def embed(self, text: str) -> list[float]:
        ...

    def embed_many(self, texts: list[str]) -> list[list[float]]:
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

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(text) for text in texts]


def _validate_embedding_vector(
    vector: object,
    *,
    expected_dimension: int | None = None,
) -> list[float]:
    if not isinstance(vector, list) or not vector:
        raise ValueError("embedding vector must be a non-empty list")
    if any(isinstance(value, bool) or not isinstance(value, Real) for value in vector):
        raise ValueError("embedding vector must contain only numbers")
    values = [float(value) for value in vector]
    if expected_dimension is not None and len(values) != expected_dimension:
        raise ValueError(
            f"embedding vector dimension mismatch: expected {expected_dimension}, got {len(values)}"
        )
    return values


class OpenAICompatibleEmbeddingProvider:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        http_client=None,
        timeout: float = 30,
    ):
        if not base_url:
            raise ValueError("EMBEDDING_BASE_URL is required for openai-compatible embeddings")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.http_client = http_client or httpx
        self.timeout = timeout
        self.dimension: int | None = None

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        response = self.http_client.post(
            f"{self.base_url}/embeddings",
            json={"model": self.model, "input": texts if len(texts) > 1 else texts[0]},
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        try:
            vectors = [item["embedding"] for item in payload["data"]]
        except (KeyError, TypeError) as exc:
            raise ValueError("embedding response did not contain data[].embedding") from exc
        if len(vectors) != len(texts):
            raise ValueError(f"embedding response count mismatch: expected {len(texts)}, got {len(vectors)}")
        values = [_validate_embedding_vector(vector, expected_dimension=self.dimension) for vector in vectors]
        if values:
            self.dimension = len(values[0])
        return values


class OllamaEmbeddingProvider:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        http_client=None,
        timeout: float = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.http_client = http_client or httpx
        self.timeout = timeout
        self.dimension: int | None = None

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        response = self.http_client.post(
            f"{self.base_url}/api/embed",
            json={"model": self.model, "input": texts if len(texts) > 1 else texts[0]},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        vectors = payload.get("embeddings")
        if vectors is None and payload.get("embedding") is not None:
            vectors = [payload["embedding"]]
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            raise ValueError(f"embedding response count mismatch: expected {len(texts)}, got {len(vectors or [])}")
        values = [_validate_embedding_vector(vector, expected_dimension=self.dimension) for vector in vectors]
        if values:
            self.dimension = len(values[0])
        return values


def build_embedding_provider(
    config: Settings = settings,
    *,
    http_client=None,
) -> EmbeddingProvider:
    provider = config.EMBEDDING_PROVIDER.strip().lower()
    environment = config.ENVIRONMENT.strip().lower()
    if provider == "hash":
        if environment == "production":
            raise ValueError("hash embedding provider is not allowed in production")
        return HashEmbeddingProvider(dimension=config.RAG_EMBEDDING_DIMENSION)
    if provider in {"openai-compatible", "openai", "dashscope", "aliyun"}:
        api_key, _ = embedding_api_key(config)
        return OpenAICompatibleEmbeddingProvider(
            base_url=embedding_base_url(config) or "",
            api_key=api_key,
            model=config.EMBEDDING_MODEL,
            http_client=http_client,
            timeout=config.EMBEDDING_TIMEOUT_SECONDS,
        )
    if provider == "ollama":
        if environment == "production":
            raise ValueError("ollama embedding provider is not allowed in production")
        return OllamaEmbeddingProvider(
            base_url=config.OLLAMA_BASE_URL,
            model=config.EMBEDDING_MODEL,
            http_client=http_client,
            timeout=config.EMBEDDING_TIMEOUT_SECONDS,
        )
    raise ValueError(f"unsupported embedding provider: {config.EMBEDDING_PROVIDER}")


class QdrantKnowledgeVectorStore:
    def __init__(self, url: str | None = None, collection_name: str | None = None, dimension: int | None = None):
        from qdrant_client import QdrantClient

        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self.dimension = dimension or settings.RAG_EMBEDDING_DIMENSION
        self.client = QdrantClient(url=url or settings.QDRANT_URL)

    def _collection_vector_size(self) -> int | None:
        try:
            info = self.client.get_collection(self.collection_name)
            vectors = info.config.params.vectors
            if isinstance(vectors, dict):
                first_vector = next(iter(vectors.values()))
                return int(first_vector.size)
            return int(vectors.size)
        except Exception:
            return None

    def _ensure_collection(self, dimension: int | None = None) -> None:
        from qdrant_client.models import Distance, VectorParams

        target_dimension = dimension or self.dimension
        if self.client.collection_exists(self.collection_name):
            existing_dimension = self._collection_vector_size()
            if existing_dimension is None or existing_dimension == target_dimension:
                return
            if settings.RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH:
                self.client.delete_collection(self.collection_name)
            else:
                raise ValueError(
                    "Qdrant collection vector dimension mismatch: "
                    f"existing={existing_dimension}, target={target_dimension}. "
                    "Set RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH=true to recreate it."
                )
        if self.client.collection_exists(self.collection_name):
            return
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(size=target_dimension, distance=Distance.COSINE),
        )

    def upsert_chunks(self, chunks: list[tuple[int, list[float], dict]]) -> None:
        from qdrant_client.models import PointStruct

        if not chunks:
            return
        self._ensure_collection(len(chunks[0][1]))
        self.client.upsert(
            collection_name=self.collection_name,
            points=[
                PointStruct(id=chunk_id, vector=vector, payload=payload)
                for chunk_id, vector, payload in chunks
            ],
        )

    def search(self, query_vector: list[float], tags: list[str], limit: int) -> list[tuple[int, float]]:
        self._ensure_collection(len(query_vector))
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
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(paragraph[index : index + max_chars] for index in range(0, len(paragraph), max_chars))
            continue
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
        import_batch_id: str | None = None,
        credibility_level: str | None = None,
    ) -> KnowledgeDocument:
        document = KnowledgeDocument(
            title=title,
            category=category,
            source=source,
            source_type=source_type,
            version=version,
            published_year=published_year,
            file_path=file_path,
            import_batch_id=import_batch_id,
            credibility_level=credibility_level,
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
        self.db.refresh(document)
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
                "import_batch_id": document.import_batch_id,
                "credibility_level": document.credibility_level,
                "skipped_reason": document.skipped_reason,
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
        document = self.db.get(KnowledgeDocument, document_id)
        if document is None:
            return
        try:
            KnowledgeVectorIndexService(
                self.db,
                embedding_provider=self.embedding_provider,
                vector_store=self.vector_store,
            ).index_all(document_id=document_id)
            document.status = "ACTIVE"
            document.skipped_reason = None
            self.db.commit()
        except Exception as exc:
            error = str(exc)
            document.status = "INDEX_FAILED"
            document.skipped_reason = f"索引失败：{error}"
            logger.exception(
                "knowledge document vector indexing failed",
                extra={"document_id": document_id, "knowledge_title": document.title, "index_error": error},
            )
            AuditService(self.db).record(
                action="KNOWLEDGE_INDEX_FAILED",
                resource_type="KnowledgeDocument",
                actor_id=None,
                resource_id=str(document.id),
                metadata={
                    "title": document.title,
                    "error": error,
                },
            )
            self.db.commit()


class KnowledgeRetrievalService:
    KEYWORD_RETRIEVABLE_STATUSES = ("ACTIVE", "INDEX_FAILED")

    def __init__(
        self,
        db: Session,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: KnowledgeVectorStore | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def retrieve(self, query: str, tags: list[str], limit: int = 5) -> list[RetrievedEvidence]:
        if settings.RAG_VECTOR_SEARCH_ENABLED:
            fallback_reason = None
            try:
                vector_results, fallback_reason = self._retrieve_from_vector_store(query=query, tags=tags, limit=limit)
            except Exception as exc:
                fallback_reason = str(exc) or exc.__class__.__name__
                vector_results = []
            if vector_results:
                return vector_results
            self._record_keyword_fallback(query=query, tags=tags, reason=fallback_reason or "vector_results_empty")
            return self._retrieve_by_keywords(
                query=query,
                tags=tags,
                limit=limit,
                retrieval_mode="keyword_fallback",
                fallback_reason=fallback_reason or "vector_results_empty",
            )
        return self._retrieve_by_keywords(query=query, tags=tags, limit=limit)

    def _retrieve_from_vector_store(
        self,
        query: str,
        tags: list[str],
        limit: int,
    ) -> tuple[list[RetrievedEvidence], str | None]:
        store = self.vector_store
        embedding_provider = self.embedding_provider or build_embedding_provider()
        if store is None:
            has_indexed_chunks = self.db.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
                .where(KnowledgeDocument.status == "ACTIVE", KnowledgeChunk.embedding_ref.is_not(None))
            )
            if not has_indexed_chunks:
                return [], "no_indexed_active_chunks"
            store = QdrantKnowledgeVectorStore()

        matches = store.search(embedding_provider.embed(query), tags=tags, limit=limit)
        if not matches:
            return [], "vector_results_empty"

        chunk_ids = [chunk_id for chunk_id, _ in matches]
        rows = self.db.execute(
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(
                KnowledgeDocument.status == "ACTIVE",
                KnowledgeChunk.id.in_(chunk_ids),
                KnowledgeChunk.embedding_ref.is_not(None),
            )
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
                    retrieval_mode="vector",
                    document_status=document.status,
                    document_skipped_reason=document.skipped_reason,
                    source_type=document.source_type,
                    version=document.version,
                    section=chunk.source_section,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    credibility_level=document.credibility_level,
                )
            )
        if not results:
            return [], "vector_chunks_not_indexed_or_not_active"
        return results[:limit], None

    def _retrieve_by_keywords(
        self,
        query: str,
        tags: list[str],
        limit: int,
        *,
        retrieval_mode: str = "keyword",
        fallback_reason: str | None = None,
    ) -> list[RetrievedEvidence]:
        query_terms = {term for term in re.split(r"\s+", query.strip()) if term}
        tag_set = set(tags)
        rows = self.db.execute(
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeDocument.status.in_(self.KEYWORD_RETRIEVABLE_STATUSES))
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
                    retrieval_mode=retrieval_mode,
                    fallback_reason=fallback_reason,
                    document_status=document.status,
                    document_skipped_reason=document.skipped_reason,
                    source_type=document.source_type,
                    version=document.version,
                    section=chunk.source_section,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    credibility_level=document.credibility_level,
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    def _record_keyword_fallback(self, *, query: str, tags: list[str], reason: str) -> None:
        AuditService(self.db).record(
            action="KNOWLEDGE_RETRIEVAL_KEYWORD_FALLBACK",
            resource_type="KnowledgeDocument",
            metadata={
                "query": query,
                "tags": tags,
                "retrieval_mode": "keyword_fallback",
                "fallback_reason": reason,
            },
        )


class KnowledgeVectorIndexService:
    def __init__(
        self,
        db: Session,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: KnowledgeVectorStore | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider or build_embedding_provider()
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
        store = self.vector_store or QdrantKnowledgeVectorStore()
        pending: list[tuple[KnowledgeChunk, KnowledgeDocument]] = []
        skipped = 0
        indexed = 0
        batch_size = max(1, settings.RAG_INDEX_BATCH_SIZE)
        for chunk, document in rows:
            if chunk.embedding_ref:
                skipped += 1
                continue
            pending.append((chunk, document))
            if len(pending) >= batch_size:
                indexed += self._embed_and_upsert_batch(store, pending)
                pending = []

        if not pending:
            return {"indexed": indexed, "skipped": skipped}

        indexed += self._embed_and_upsert_batch(store, pending)
        return {"indexed": indexed, "skipped": skipped}

    def _embed_and_upsert_batch(
        self,
        store: KnowledgeVectorStore,
        rows: list[tuple[KnowledgeChunk, KnowledgeDocument]],
    ) -> int:
        vectors = self.embedding_provider.embed_many([chunk.content for chunk, _ in rows])
        if len(vectors) != len(rows):
            raise ValueError(f"embedding response count mismatch: expected {len(rows)}, got {len(vectors)}")
        points = [
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
                    "credibility_level": document.credibility_level,
                },
            )
            for (chunk, document), vector in zip(rows, vectors, strict=True)
        ]
        return self._upsert_batch(store, points)

    def _upsert_batch(self, store: KnowledgeVectorStore, points: list[tuple[int, list[float], dict]]) -> int:
        store.upsert_chunks(points)
        for chunk_id, _, _ in points:
            chunk = self.db.get(KnowledgeChunk, chunk_id)
            if chunk is not None:
                chunk.embedding_ref = f"qdrant:{settings.QDRANT_COLLECTION}:{chunk_id}"
        self.db.commit()
        return len(points)
