from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.research_export import (
    ResearchExportApproval,
    ResearchExportRequestCreate,
    ResearchExportRequestRead,
    ResearchExportResponse,
    ResearchSummaryResponse,
)
from app.services.research_export_service import ResearchExportService

router = APIRouter(prefix="/research/export", tags=["research-export"])


@router.get("/users", response_model=ResearchExportResponse)
def export_desensitized_users(
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ResearchExportService(db).export_users(current_user)


@router.get("/summary", response_model=ResearchSummaryResponse)
def research_summary(
    current_user: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ResearchExportService(db).summary(current_user)


def _request_read(item) -> ResearchExportRequestRead:
    return ResearchExportRequestRead(
        id=item.id,
        requested_by=item.requested_by,
        organization_id=item.organization_id,
        format=item.format,
        purpose=item.purpose,
        status=item.status,
        approved_by=item.approved_by,
        approval_comment=item.approval_comment,
        row_count=item.row_count,
        expires_at=item.expires_at.isoformat() if item.expires_at else None,
        downloaded_at=item.downloaded_at.isoformat() if item.downloaded_at else None,
        created_at=item.created_at.isoformat(),
    )


@router.post("/requests", response_model=ResearchExportRequestRead, status_code=status.HTTP_201_CREATED)
def create_export_request(
    payload: ResearchExportRequestCreate,
    current_user: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    item = ResearchExportService(db).create_request(current_user, payload.format, payload.purpose)
    return _request_read(item)


@router.get("/requests", response_model=list[ResearchExportRequestRead])
def list_export_requests(
    current_user: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return [_request_read(item) for item in ResearchExportService(db).list_requests(current_user)]


@router.post("/requests/{request_id}/approve", response_model=ResearchExportRequestRead)
def approve_export_request(
    request_id: int,
    payload: ResearchExportApproval,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    item = ResearchExportService(db).approve_request(request_id, current_user, payload.approval_comment)
    return _request_read(item)


@router.post("/requests/{request_id}/reject", response_model=ResearchExportRequestRead)
def reject_export_request(
    request_id: int,
    payload: ResearchExportApproval,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    item = ResearchExportService(db).reject_request(request_id, current_user, payload.approval_comment)
    return _request_read(item)


@router.get("/requests/{request_id}/download")
def download_export_request(
    request_id: int,
    current_user: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    filename, media_type, content = ResearchExportService(db).build_download(request_id, current_user)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
