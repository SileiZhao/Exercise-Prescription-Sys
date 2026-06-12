from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.risk import RiskRuleConfig
from app.schemas.admin_rules import RiskRuleConfigCreate, RiskRuleConfigUpdate
from app.schemas.risk import RiskEvaluationResult
from app.services.audit_service import AuditService
from app.services.risk_engine import BUILTIN_RULES, RiskEngine, RiskRule, RuleCondition


class AdminRiskRuleService:
    def __init__(self, db: Session):
        self.db = db

    def create_rule(self, payload: RiskRuleConfigCreate, actor_id: int) -> RiskRuleConfig:
        existing = self.db.scalar(select(RiskRuleConfig).where(RiskRuleConfig.code == payload.code))
        if existing is not None:
            existing.name = payload.name
            existing.severity = payload.severity
            existing.priority = payload.priority
            existing.rule_type = payload.rule_type
            existing.source_ref = payload.source_ref
            existing.applies_to = payload.applies_to
            existing.review_status = payload.review_status
            existing.message = payload.message
            existing.condition = payload.condition.model_dump()
            existing.contraindications = payload.contraindications
            existing.intensity_cap = payload.intensity_cap
            existing.is_active = payload.is_active
            existing.version += 1
            existing.updated_by = actor_id
            rule = existing
            action = "UPDATE_RISK_RULE"
        else:
            rule = RiskRuleConfig(
                **payload.model_dump(mode="json"),
                created_by=actor_id,
                updated_by=actor_id,
                version=1,
            )
            self.db.add(rule)
            action = "CREATE_RISK_RULE"

        AuditService(self.db).record(
            action=action,
            resource_type="RiskRuleConfig",
            actor_id=actor_id,
            resource_id=payload.code,
            metadata={"severity": payload.severity, "is_active": payload.is_active},
        )
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def update_rule(
        self, rule_id: int, payload: RiskRuleConfigUpdate, actor_id: int
    ) -> RiskRuleConfig | None:
        rule = self.db.get(RiskRuleConfig, rule_id)
        if rule is None:
            return None
        updates = payload.model_dump(exclude_unset=True, mode="json")
        for key, value in updates.items():
            setattr(rule, key, value)
        rule.version += 1
        rule.updated_by = actor_id
        AuditService(self.db).record(
            action="UPDATE_RISK_RULE",
            resource_type="RiskRuleConfig",
            actor_id=actor_id,
            resource_id=rule.code,
            metadata={"version": rule.version, "is_active": rule.is_active},
        )
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def list_rules(self) -> list[RiskRuleConfig]:
        return list(self.db.scalars(select(RiskRuleConfig).order_by(RiskRuleConfig.id.desc())))

    def test_snapshot(self, snapshot: dict) -> RiskEvaluationResult:
        return RiskEngine(rules=self.runtime_rules()).evaluate(snapshot)

    def runtime_rules(self) -> tuple[RiskRule, ...]:
        configured = self.db.scalars(
            select(RiskRuleConfig)
            .where(RiskRuleConfig.is_active.is_(True))
            .order_by(RiskRuleConfig.priority.asc(), RiskRuleConfig.id.asc())
        ).all()
        return (*BUILTIN_RULES, *(self._to_runtime_rule(rule) for rule in configured))

    def _to_runtime_rule(self, rule: RiskRuleConfig) -> RiskRule:
        condition = rule.condition or {}
        return RiskRule(
            code=rule.code,
            severity=rule.severity,
            message=rule.message,
            condition=RuleCondition(
                path=condition["path"],
                op=condition["op"],
                value=condition.get("value"),
            ),
            contraindications=tuple(rule.contraindications or []),
        )
