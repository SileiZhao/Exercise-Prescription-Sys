from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.report import ReportExportRecordList
from app.services.report_service import DOCX_MEDIA_TYPE, PDF_MEDIA_TYPE, PrescriptionReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/exports", response_model=ReportExportRecordList)
def list_my_report_exports(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return PrescriptionReportService(db).list_exports_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.get("/exports/all", response_model=ReportExportRecordList)
def list_all_report_exports(
    limit: int = 50,
    offset: int = 0,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return PrescriptionReportService(db).list_all_exports(limit=limit, offset=offset)


@router.get("/prescriptions/{prescription_id}.docx")
def export_prescription_docx(
    prescription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename, content = PrescriptionReportService(db).build_docx(
        prescription_id=prescription_id,
        requester_id=current_user.id,
    )
    return Response(
        content=content,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/prescriptions/{prescription_id}.pdf")
def export_prescription_pdf(
    prescription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename, content = PrescriptionReportService(db).build_pdf(
        prescription_id=prescription_id,
        requester_id=current_user.id,
    )
    return Response(
        content=content,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/phase-assessment.docx")
def export_phase_assessment_docx(
    prescription_id: int | None = None,
    weeks: int = 4,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename, content = PrescriptionReportService(db).build_phase_assessment_docx(
        requester_id=current_user.id,
        weeks=weeks,
        prescription_id=prescription_id,
    )
    return Response(
        content=content,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/phase-assessment.pdf")
def export_phase_assessment_pdf(
    prescription_id: int | None = None,
    weeks: int = 4,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename, content = PrescriptionReportService(db).build_phase_assessment_pdf(
        requester_id=current_user.id,
        weeks=weeks,
        prescription_id=prescription_id,
    )
    return Response(
        content=content,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
