from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.compliance import ComplianceDocumentRead
from app.services.compliance_service import ComplianceService

router = APIRouter(tags=["compliance"])


@router.get("/compliance/materials/{code}", response_model=ComplianceDocumentRead)
def get_compliance_material(code: str, db: Session = Depends(get_db)):
    material = ComplianceService(db).get_material(code)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="合规材料不存在")
    return material


@router.get("/admin/compliance/materials", response_model=list[ComplianceDocumentRead])
def list_compliance_materials(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ComplianceService(db).list_materials()
