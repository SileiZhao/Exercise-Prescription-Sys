from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.admin_rules import (
    RiskRuleConfigCreate,
    RiskRuleConfigRead,
    RiskRuleConfigUpdate,
    RiskRuleTestRequest,
    RiskRuleTestResult,
)
from app.services.admin_rule_service import AdminRiskRuleService

router = APIRouter(prefix="/admin/rules", tags=["admin-rules"])


@router.post("", response_model=RiskRuleConfigRead)
def create_rule(
    payload: RiskRuleConfigCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return AdminRiskRuleService(db).create_rule(payload, actor_id=current_user.id)


@router.get("", response_model=list[RiskRuleConfigRead])
def list_rules(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return AdminRiskRuleService(db).list_rules()


@router.patch("/{rule_id}", response_model=RiskRuleConfigRead)
def update_rule(
    rule_id: int,
    payload: RiskRuleConfigUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    rule = AdminRiskRuleService(db).update_rule(rule_id, payload, actor_id=current_user.id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")
    return rule


@router.post("/test", response_model=RiskRuleTestResult)
def test_rules(
    payload: RiskRuleTestRequest,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.EXPERT, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return AdminRiskRuleService(db).test_snapshot(payload.snapshot)
