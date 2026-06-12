from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.knowledge import (
    KnowledgeDocumentCreate,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentRead,
    KnowledgeDocumentStatusUpdate,
    KnowledgeEvidence,
    KnowledgeReindexResponse,
    KnowledgeSearchRequest,
)
from app.services.knowledge_service import KnowledgeIngestionService, KnowledgeRetrievalService, KnowledgeVectorIndexService

router = APIRouter(prefix="/admin/knowledge", tags=["admin-knowledge"])


@router.post("/documents", response_model=KnowledgeDocumentRead)
def create_document(
    payload: KnowledgeDocumentCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return KnowledgeIngestionService(db).ingest_text(
        title=payload.title,
        category=payload.category,
        content=payload.content,
        tags=payload.tags,
        source=payload.source,
        source_type=payload.source_type,
        version=payload.version,
        published_year=payload.published_year,
        file_path=payload.file_path,
        import_batch_id=payload.import_batch_id,
        credibility_level=payload.credibility_level,
        created_by=current_user.id,
    )


@router.get("/documents", response_model=KnowledgeDocumentListResponse)
def list_documents(
    q: str | None = Query(default=None, max_length=128),
    category: str | None = Query(default=None, max_length=64),
    status: str | None = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    items, total = KnowledgeIngestionService(db).list_documents(
        q=q,
        category=category,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {"items": items, "total": total}


@router.post("/documents/upload", response_model=KnowledgeDocumentRead)
async def upload_document(
    title: str = Form(...),
    category: str = Form(...),
    tags: str = Form(default=""),
    source: str | None = Form(default=None),
    source_type: str | None = Form(default=None),
    version: str | None = Form(default=None),
    published_year: str | None = Form(default=None),
    import_batch_id: str | None = Form(default=None),
    credibility_level: str | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    content = raw.decode("utf-8-sig")
    parsed_tags = [item.strip() for item in tags.replace("，", ",").split(",") if item.strip()]
    filename = file.filename or "uploaded-knowledge.txt"
    return KnowledgeIngestionService(db).ingest_text(
        title=title,
        category=category,
        content=content,
        tags=parsed_tags,
        source=source or filename,
        source_type=source_type,
        version=version,
        published_year=published_year,
        file_path=f"upload://{filename}",
        import_batch_id=import_batch_id,
        credibility_level=credibility_level,
        created_by=current_user.id,
    )


@router.patch("/documents/{document_id}", response_model=KnowledgeDocumentRead)
def update_document_status(
    document_id: int,
    payload: KnowledgeDocumentStatusUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    document = KnowledgeIngestionService(db).update_status(
        document_id=document_id,
        status=payload.status,
        actor_id=current_user.id,
        reason=payload.reason,
    )
    if document is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识文档不存在")
    return document


@router.post("/search", response_model=list[KnowledgeEvidence])
def search_knowledge(
    payload: KnowledgeSearchRequest,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return KnowledgeRetrievalService(db).retrieve(
        query=payload.query,
        tags=payload.tags,
        limit=payload.limit,
    )


@router.post("/reindex", response_model=KnowledgeReindexResponse)
def rebuild_knowledge_vector_index(
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return KnowledgeVectorIndexService(db).index_all()
