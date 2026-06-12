from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health_data import RiskScreening
from app.schemas.risk import RiskEvaluationResult
from app.services.admin_rule_service import AdminRiskRuleService
from app.services.health_profile_service import HealthProfileService
from app.services.risk_engine import RiskEngine


class RiskEvaluationService:
    def __init__(self, db: Session):
        self.db = db
        self.health_service = HealthProfileService(db)

    def evaluate_current_user(self, user_id: int) -> RiskEvaluationResult:
        snapshot = self.health_service.latest_snapshot(user_id)
        self.engine = RiskEngine(rules=AdminRiskRuleService(self.db).runtime_rules())
        result = self.engine.evaluate(snapshot)
        self._persist_latest_screening(user_id, result)
        return result

    def _persist_latest_screening(self, user_id: int, result: RiskEvaluationResult) -> None:
        screening = self.db.scalar(
            select(RiskScreening)
            .where(RiskScreening.user_id == user_id)
            .order_by(RiskScreening.created_at.desc())
            .limit(1)
        )
        if screening is None:
            return
        screening.risk_level = result.risk_level
        screening.risk_reasons = [rule.message for rule in result.matched_rules]
        self.db.commit()
