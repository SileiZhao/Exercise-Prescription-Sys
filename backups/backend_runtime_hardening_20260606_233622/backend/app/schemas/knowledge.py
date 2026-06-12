from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeDocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)
    source: str | None = None
    source_type: str | None = None
    version: str | None = None
    published_year: str | None = None
    file_path: str | None = None
    import_batch_id: str | None = None
    credibility_level: str | None = None


class KnowledgeDocumentRead(BaseModel):
    id: int
    title: str
    category: str
    source: str | None
    source_type: str | None = None
    version: str | None = None
    published_year: str | None = None
    file_path: str | None = None
    import_batch_id: str | None = None
    credibility_level: str | None = None
    skipped_reason: str | None = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeDocumentListItem(KnowledgeDocumentRead):
    chunk_count: int


class KnowledgeDocumentListResponse(BaseModel):
    items: list[KnowledgeDocumentListItem]
    total: int


class KnowledgeDocumentStatusUpdate(BaseModel):
    status: Literal["ACTIVE", "ARCHIVED"]
    reason: str | None = Field(default=None, max_length=500)


class KnowledgeEvidence(BaseModel):
    document_id: int
    document_title: str
    chunk_id: int
    content: str
    tags: list[str]
    score: float
    retrieval_mode: Literal["vector", "keyword", "keyword_fallback"] = "keyword"
    fallback_reason: str | None = None
    document_status: str
    document_skipped_reason: str | None = None
    source_type: str | None = None
    version: str | None = None
    section: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    credibility_level: str | None = None


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)
    limit: int = Field(default=5, ge=1, le=20)


class KnowledgeReindexResponse(BaseModel):
    indexed: int
    skipped: int
