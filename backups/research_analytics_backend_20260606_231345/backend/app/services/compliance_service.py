from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.template import ComplianceDocument


class ComplianceService:
    def __init__(self, db: Session):
        self.db = db

    def list_materials(self, include_archived: bool = False) -> list[ComplianceDocument]:
        query = select(ComplianceDocument)
        if not include_archived:
            query = query.where(ComplianceDocument.status == "ACTIVE")
        return list(self.db.scalars(query.order_by(ComplianceDocument.code.asc())))

    def get_material(self, code: str) -> ComplianceDocument | None:
        return self.db.scalar(
            select(ComplianceDocument).where(
                ComplianceDocument.code == code,
                ComplianceDocument.status == "ACTIVE",
            )
        )
