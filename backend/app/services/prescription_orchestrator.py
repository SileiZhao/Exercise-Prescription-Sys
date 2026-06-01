from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.template import ActionReviewStatus, ExerciseAction
from app.schemas.prescription import PrescriptionDraft
from app.services.audit_service import AuditService
from app.services.clustering_service import ClusterPersistenceService
from app.services.knowledge_service import KnowledgeRetrievalService
from app.services.llm_service import LLMProvider, build_llm_provider
from app.services.prescription_safety_service import enforce_prescription_safety
from app.services.risk_service import RiskEvaluationService
from app.services.template_service import TemplateMatchingService


class PrescriptionOrchestrator:
    def __init__(self, db: Session, llm_provider: LLMProvider | None = None):
        self.db = db
        self.llm_provider = llm_provider or build_llm_provider()

    def generate_for_user(self, user_id: int) -> PrescriptionRecord:
        risk = RiskEvaluationService(self.db).evaluate_current_user(user_id)

        if risk.risk_level == "R3":
            checked = enforce_prescription_safety(
                "R3",
                {
                    "risk_level": "R3",
                    "cluster_label": "高风险转介型",
                    "goals": ["安全评估"],
                    "fitt_vp": None,
                    "precautions": [risk.message],
                    "contraindications": risk.contraindications,
                    "reassessment": "医学评估后再确定运动计划",
                    "evidence_refs": [],
                    "expert_review_required": True,
                },
            )
            return self._create_record(
                user_id=user_id,
                template_id=None,
                draft=checked,
                status="REFERRED",
                llm_payload={},
            )

        assignment = ClusterPersistenceService(self.db).classify_user(user_id)
        goals = ((risk.source_snapshot or {}).get("profile") or {}).get("exercise_goal") or ["体质提升"]
        template = TemplateMatchingService(self.db).match_template(
            risk_level=risk.risk_level,
            cluster_labels=assignment.rule_labels,
            goals=goals,
        )
        template_payload = self._template_payload(template)
        evidence = KnowledgeRetrievalService(self.db).retrieve(
            query=" ".join([risk.risk_level, *assignment.rule_labels, *goals]),
            tags=[risk.risk_level, *assignment.rule_labels, *goals],
            limit=5,
        )
        evidence_refs = [item.model_dump() for item in evidence]
        candidate_actions = self._candidate_actions(risk.risk_level, assignment.rule_labels, goals)
        llm_payload = {
            "risk_level": risk.risk_level,
            "cluster_label": assignment.cluster_label,
            "goals": goals,
            "template": template_payload,
            "risk_rules": [rule.model_dump() for rule in risk.matched_rules],
            "evidence_refs": [str(item["chunk_id"]) for item in evidence_refs],
            "candidate_actions": candidate_actions,
        }
        draft = self.llm_provider.generate_prescription(llm_payload)
        AuditService(self.db).record(
            action="LLM_GENERATE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            actor_id=user_id,
            metadata={
                "risk_level": risk.risk_level,
                "provider": self.llm_provider.__class__.__name__,
                "evidence_count": len(evidence_refs),
                "candidate_action_count": len(candidate_actions),
            },
        )
        checked = enforce_prescription_safety(risk.risk_level, draft.model_dump(mode="json"))
        checked = PrescriptionDraft.model_validate(checked).model_dump(mode="json")
        status = "PENDING_REVIEW" if risk.risk_level == "R2" else "PUBLISHED"

        return self._create_record(
            user_id=user_id,
            template_id=template.id if template else None,
            draft={**checked, "evidence_refs": evidence_refs},
            status=status,
            llm_payload=llm_payload,
        )

    def _template_payload(self, template) -> dict:
        if template is None:
            return {
                "fitt_vp": {
                    "frequency": "每周3次",
                    "intensity": "低—中等强度",
                    "time": "每次20-30分钟",
                    "type": ["快走", "八段锦"],
                    "volume": "每周90分钟",
                    "progression": "每2-4周根据反馈调整",
                },
                "precautions": ["循序渐进", "出现不适立即停止"],
                "contraindications": [],
            }
        return {
            "fitt_vp": template.fitt_vp,
            "precautions": template.precautions,
            "contraindications": template.contraindications,
        }

    def _candidate_actions(self, risk_level: str, cluster_labels: list[str], goals: list[str]) -> list[dict]:
        rows = list(
            self.db.scalars(
                select(ExerciseAction)
                .where(ExerciseAction.status == ActionReviewStatus.APPROVED)
                .order_by(ExerciseAction.id.asc())
            )
        )
        tags = {risk_level, *cluster_labels, *goals}
        candidates: list[tuple[int, ExerciseAction]] = []
        for action in rows:
            risk_match = action.risk_level == risk_level or risk_level in (action.risk_level or "").split("/")
            tag_score = len(tags.intersection(set(action.suitable_tags or [])))
            if not risk_match and tag_score <= 0:
                continue
            candidates.append((tag_score + int(risk_match), action))
        candidates.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "id": action.id,
                "name": action.name,
                "category": action.category,
                "risk_level": action.risk_level,
                "suitable_tags": action.suitable_tags or [],
                "contraindication_tags": action.contraindication_tags or [],
                "body_parts": action.body_parts or [],
                "primary_muscles": action.primary_muscles or [],
                "equipment": action.equipment,
                "intensity": action.intensity,
                "difficulty": action.difficulty,
                "instructions": action.instructions,
                "alternatives": action.alternatives or [],
                "monitoring_tips": action.monitoring_tips or [],
                "stop_signals": action.stop_signals or [],
            }
            for _, action in candidates[:8]
        ]

    def _create_record(
        self,
        user_id: int,
        template_id: int | None,
        draft: dict,
        status: str,
        llm_payload: dict,
    ) -> PrescriptionRecord:
        latest = self.db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.version.desc())
            .limit(1)
        )
        version = (latest.version + 1) if latest else 1
        record = PrescriptionRecord(
            user_id=user_id,
            template_id=template_id,
            risk_level=draft["risk_level"],
            cluster_label=draft.get("cluster_label"),
            goals=draft.get("goals") or [],
            fitt_vp=draft.get("fitt_vp"),
            precautions=draft.get("precautions") or [],
            contraindications=draft.get("contraindications") or [],
            reassessment=draft.get("reassessment") or "4周小评估，12周阶段评估",
            evidence_refs=draft.get("evidence_refs") or [],
            llm_payload=llm_payload,
            safety_notice=draft.get("safety_notice"),
            status=status,
            expert_review_required=bool(draft.get("expert_review_required")) or status in {"PENDING_REVIEW", "REFERRED"},
            version=version,
            parent_id=latest.id if latest else None,
        )
        self.db.add(record)
        self.db.flush()
        self.db.add(
            PrescriptionVersion(
                prescription_id=record.id,
                version=record.version,
                snapshot={
                    "risk_level": record.risk_level,
                    "cluster_label": record.cluster_label,
                    "fitt_vp": record.fitt_vp,
                    "status": record.status,
                    "evidence_refs": record.evidence_refs,
                },
            )
        )
        AuditService(self.db).record(
            action="CREATE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            actor_id=user_id,
            resource_id=str(record.id),
            metadata={
                "risk_level": record.risk_level,
                "status": record.status,
                "version": record.version,
                "template_id": template_id,
            },
        )
        self.db.commit()
        self.db.refresh(record)
        return record
