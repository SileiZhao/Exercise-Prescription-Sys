from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.research_export import ResearchExportResponse, ResearchSummaryResponse
from app.services.research_export_service import ResearchExportService

router = APIRouter(prefix="/research/export", tags=["research-export"])


@router.get("/users", response_model=ResearchExportResponse)
def export_desensitized_users(
    _: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ResearchExportService(db).export_users()


@router.get("/summary", response_model=ResearchSummaryResponse)
def research_summary(
    _: User = Depends(require_roles(UserRole.RESEARCHER, UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ResearchExportService(db).summary()
