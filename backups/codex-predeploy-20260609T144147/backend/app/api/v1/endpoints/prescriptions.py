from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.readiness import ReadinessService
from app.models.prescription import PrescriptionRecord
from app.models.user import User
from app.schemas.prescription import PrescriptionRecordRead
from app.services.prescription_orchestrator import (
    PrescriptionGenerationBlocked,
    PrescriptionOrchestrator,
    PrescriptionProviderUnavailable,
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


def _raise_if_production_providers_unready() -> None:
    if settings.ENVIRONMENT.strip().lower() != "production":
        return
    service = ReadinessService(settings=settings)
    checks = {
        "llm": service.check_llm(),
        "embedding": service.check_embedding(),
        "OCR": service.check_ocr(),
    }
    failures = [
        f"{name}: {component.detail or component.status}"
        for name, component in checks.items()
        if component.status != "ok"
    ]
    if failures:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"生产 LLM/provider 未就绪：{'; '.join(failures)}",
        )


@router.post("/generate", response_model=PrescriptionRecordRead)
def generate_prescription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _raise_if_production_providers_unready()
    try:
        return PrescriptionOrchestrator(db).generate_for_user(current_user.id)
    except PrescriptionGenerationBlocked as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "reason": exc.reason,
                "message": f"{exc.message} 已阻断自动生成，无法自动发布可执行处方。",
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"处方生成 provider 不可用：{exc}",
        ) from exc
    except PrescriptionProviderUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"处方生成 provider 不可用：{exc.provider}: {exc.message}",
        ) from exc


@router.get("/me", response_model=list[PrescriptionRecordRead])
def list_my_prescriptions(
    include_history: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if include_history:
        return list(
            db.scalars(
                select(PrescriptionRecord)
                .where(PrescriptionRecord.user_id == current_user.id)
                .order_by(PrescriptionRecord.created_at.desc(), PrescriptionRecord.id.desc())
            )
        )
    latest = db.scalar(
        select(PrescriptionRecord)
        .where(PrescriptionRecord.user_id == current_user.id, PrescriptionRecord.status == "PUBLISHED")
        .order_by(PrescriptionRecord.version.desc(), PrescriptionRecord.created_at.desc(), PrescriptionRecord.id.desc())
        .limit(1)
    )
    return [latest] if latest is not None else []
