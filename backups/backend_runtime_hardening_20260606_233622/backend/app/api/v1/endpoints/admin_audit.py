from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.audit import AuditLogList
from app.services.audit_service import AuditService

router = APIRouter(prefix="/admin/audit-logs", tags=["admin-audit"])


@router.get("", response_model=AuditLogList)
def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    resource_type: str | None = None,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return AuditService(db).list_logs(
        limit=limit,
        offset=offset,
        action=action,
        resource_type=resource_type,
    )
