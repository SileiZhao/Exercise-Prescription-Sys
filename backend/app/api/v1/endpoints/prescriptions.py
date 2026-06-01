from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.prescription import PrescriptionRecord
from app.models.user import User
from app.schemas.prescription import PrescriptionRecordRead
from app.services.prescription_orchestrator import PrescriptionOrchestrator

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.post("/generate", response_model=PrescriptionRecordRead)
def generate_prescription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return PrescriptionOrchestrator(db).generate_for_user(current_user.id)


@router.get("/me", response_model=list[PrescriptionRecordRead])
def list_my_prescriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == current_user.id)
            .order_by(PrescriptionRecord.created_at.desc())
        )
    )
