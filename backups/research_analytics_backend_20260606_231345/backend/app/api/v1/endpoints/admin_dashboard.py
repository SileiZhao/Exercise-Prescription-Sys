from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.admin_dashboard import AdminDashboardSummary
from app.services.admin_dashboard_service import AdminDashboardService

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@router.get("/summary", response_model=AdminDashboardSummary)
def dashboard_summary(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return AdminDashboardService(db).summary()
