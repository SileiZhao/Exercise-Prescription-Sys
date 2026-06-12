from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.schemas.audit import AuditLogList, AuditLogRead


class AuditService:
    def __init__(self, db: Session):
        self.db = db

    def record(
        self,
        action: str,
        resource_type: str,
        actor_id: int | None = None,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        log = AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=metadata or {},
        )
        self.db.add(log)
        return log

    def list_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        action: str | None = None,
        resource_type: str | None = None,
    ) -> AuditLogList:
        limit = max(1, min(limit, 200))
        offset = max(0, offset)
        filters = []
        if action:
            filters.append(AuditLog.action == action)
        if resource_type:
            filters.append(AuditLog.resource_type == resource_type)

        total = self.db.scalar(select(func.count(AuditLog.id)).where(*filters)) or 0
        logs = self.db.scalars(
            select(AuditLog)
            .where(*filters)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return AuditLogList(
            total=total,
            items=[
                AuditLogRead(
                    id=log.id,
                    actor_id=log.actor_id,
                    action=log.action,
                    resource_type=log.resource_type,
                    resource_id=log.resource_id,
                    metadata=log.metadata_json or {},
                    created_at=log.created_at,
                )
                for log in logs
            ],
        )
