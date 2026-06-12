from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.prescription import PrescriptionEvidence, PrescriptionRecord, PrescriptionVersion
from app.models.template import KnowledgeChunk, KnowledgeDocument
from app.schemas.prescription import PrescriptionDraft
from app.services.audit_service import AuditService
from app.services.clustering_service import ClusterPersistenceService
from app.services.knowledge_service import KnowledgeRetrievalService
from app.services.llm_service import LLMProvider, build_llm_provider
from app.services.prescription_safety_service import enforce_prescription_safety
from app.services.risk_service import RiskEvaluationService
from app.services.template_service import TemplateMatchingService


class PrescriptionGenerationBlocked(RuntimeError):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


class PrescriptionProviderUnavailable(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider
        self.message = message


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
                generation_evidence={
                    "risk_rules": [rule.model_dump() for rule in risk.matched_rules],
                    "template_ref": {},
                    "action_refs": [],
                    "rag_chunks": [],
                    "llm_provider": self._llm_provider_name(),
                    "llm_model": self._llm_model(),
                    "schema_validation": {"passed": True, "schema": "PrescriptionDraft"},
                    "safety_validation": {"passed": True, "risk_level": "R3"},
                    "object_refs": [],
                },
            )

        assignment = ClusterPersistenceService(self.db).classify_user(user_id)
        goals = ((risk.source_snapshot or {}).get("profile") or {}).get("exercise_goal") or ["体质提升"]
        template = TemplateMatchingService(self.db).match_template(
            risk_level=risk.risk_level,
            cluster_labels=assignment.rule_labels,
            goals=goals,
        )
        if template is None:
            if not self._fallback_allowed():
                self._block_generation(
                    user_id,
                    "no_approved_template",
                    {
                        "risk_level": risk.risk_level,
                        "cluster_labels": assignment.rule_labels,
                        "goals": goals,
                    },
                )
            AuditService(self.db).record(
                action="PRESCRIPTION_TEMPLATE_FALLBACK_USED",
                resource_type="PrescriptionTemplate",
                actor_id=user_id,
                metadata={
                    "risk_level": risk.risk_level,
                    "cluster_labels": assignment.rule_labels,
                    "goals": goals,
                },
            )
        template_payload = self._template_payload(template)
        rag_query = " ".join([risk.risk_level, *assignment.rule_labels, *goals])
        rag_tags = [risk.risk_level, *assignment.rule_labels, *goals]
        evidence = KnowledgeRetrievalService(self.db).retrieve(
            query=rag_query,
            tags=rag_tags,
            limit=5,
        )
        if not evidence and not self._fallback_allowed():
            self._block_generation(
                user_id,
                "rag_evidence_empty",
                {
                    "risk_level": risk.risk_level,
                    "query": rag_query,
                    "tags": rag_tags,
                },
            )
        candidate_actions = TemplateMatchingService(self.db).candidate_actions(
            risk.risk_level,
            assignment.rule_labels,
            goals,
        )
        if not candidate_actions:
            if not self._fallback_allowed():
                self._block_generation(
                    user_id,
                    "no_candidate_actions",
                    {
                        "risk_level": risk.risk_level,
                        "cluster_labels": assignment.rule_labels,
                        "goals": goals,
                    },
                )
            AuditService(self.db).record(
                action="PRESCRIPTION_CANDIDATE_ACTIONS_EMPTY",
                resource_type="ExerciseAction",
                actor_id=user_id,
                metadata={
                    "risk_level": risk.risk_level,
                    "cluster_labels": assignment.rule_labels,
                    "goals": goals,
                },
            )
        if evidence and not self._fallback_allowed() and self._rag_evidence_degraded(evidence):
            self._block_generation(
                user_id,
                "rag_retrieval_degraded",
                {
                    "risk_level": risk.risk_level,
                    "query": rag_query,
                    "tags": rag_tags,
                    "retrieval_modes": sorted({item.retrieval_mode for item in evidence}),
                    "fallback_reason": self._rag_fallback_reason(evidence),
                    "document_statuses": sorted({item.document_status for item in evidence}),
                },
            )
        AuditService(self.db).record(
            action="RAG_RETRIEVE_EVIDENCE",
            resource_type="KnowledgeChunk",
            actor_id=user_id,
            metadata={
                "query": rag_query,
                "tags": rag_tags,
                "hit_count": len(evidence),
                "chunk_ids": [item.chunk_id for item in evidence],
                "retrieval_modes": sorted({item.retrieval_mode for item in evidence}),
                "fallback_reasons": sorted(
                    {item.fallback_reason for item in evidence if item.fallback_reason}
                ),
            },
        )
        evidence_refs = [item.model_dump() for item in evidence]
        forbidden_constraints = self._forbidden_constraints(risk.contraindications, risk.source_snapshot or {})
        llm_payload = {
            "risk_level": risk.risk_level,
            "cluster_label": assignment.cluster_label,
            "goals": goals,
            "template": template_payload,
            "risk_rules": [rule.model_dump() for rule in risk.matched_rules],
            "evidence_refs": [str(item["chunk_id"]) for item in evidence_refs],
            "evidence": evidence_refs,
            "candidate_actions": candidate_actions,
            "risk_result": risk.model_dump(mode="json"),
            "cluster": {
                "label": assignment.cluster_label,
                "rule_labels": assignment.rule_labels,
            },
            "forbidden_constraints": forbidden_constraints,
        }
        provider_name = self._llm_provider_name()
        provider_class = self.llm_provider.__class__.__name__
        try:
            draft = self.llm_provider.generate_prescription(llm_payload)
        except Exception as exc:
            AuditService(self.db).record(
                action="LLM_PROVIDER_UNAVAILABLE",
                resource_type="PrescriptionRecord",
                actor_id=user_id,
                metadata={
                    "risk_level": risk.risk_level,
                    "provider": provider_name,
                    "provider_class": provider_class,
                    "error": str(exc) or exc.__class__.__name__,
                },
            )
            self.db.commit()
            raise PrescriptionProviderUnavailable(provider_name, str(exc) or exc.__class__.__name__) from exc
        AuditService(self.db).record(
            action="LLM_GENERATE_PRESCRIPTION",
            resource_type="PrescriptionRecord",
            actor_id=user_id,
            metadata={
                "risk_level": risk.risk_level,
                "provider": provider_name,
                "provider_class": provider_class,
                "evidence_count": len(evidence_refs),
                "candidate_action_count": len(candidate_actions),
            },
        )
        checked = enforce_prescription_safety(
            risk.risk_level,
            draft.model_dump(mode="json"),
            risk_contraindications=risk.contraindications,
            risk_snapshot=risk.source_snapshot or {},
            template_fitt_vp=template_payload.get("fitt_vp"),
            candidate_action_names=[item["name"] for item in candidate_actions],
        )
        checked = PrescriptionDraft.model_validate(checked).model_dump(mode="json")
        status = "PENDING_REVIEW" if risk.risk_level == "R2" else "PUBLISHED"

        return self._create_record(
            user_id=user_id,
            template_id=template.id if template else None,
            draft={**checked, "evidence_refs": evidence_refs},
            status=status,
            llm_payload=llm_payload,
            generation_evidence={
                "risk_rules": [rule.model_dump() for rule in risk.matched_rules],
                "template_ref": self._template_ref(template_payload),
                "action_refs": candidate_actions,
                "rag_chunks": self._rag_chunk_refs(evidence_refs),
                "llm_provider": self._llm_provider_name(),
                "llm_model": self._llm_model(),
                "schema_validation": {"passed": True, "schema": "PrescriptionDraft"},
                "safety_validation": {
                    "passed": True,
                    "risk_level": risk.risk_level,
                    "risk_contraindications": risk.contraindications,
                    "candidate_action_count": len(candidate_actions),
                },
                "object_refs": [],
            },
        )

    def _template_payload(self, template) -> dict:
        if template is None:
            return {
                "fallback": True,
                "fallback_reason": "no_approved_template",
                "environment": settings.ENVIRONMENT,
                "allowed_by": "development_or_test_environment",
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
            "fallback": False,
            "id": template.id,
            "template_code": template.template_code,
            "name": template.name,
            "version": template.version,
            "source_version": template.source_version,
            "status": template.status.value,
            "fitt_vp": template.fitt_vp,
            "precautions": template.precautions,
            "contraindications": template.contraindications,
            "evidence_refs": template.evidence_refs,
        }

    def _forbidden_constraints(self, risk_contraindications: list[str], risk_snapshot: dict) -> list[str]:
        constraints = list(risk_contraindications or [])
        screening = risk_snapshot.get("risk_screening") or {}
        fitness = risk_snapshot.get("fitness_test") or {}
        medication = screening.get("medication") or []
        if isinstance(medication, str):
            medication = [medication]
        if screening.get("has_hypertension"):
            constraints.append("禁止憋气发力和大重量抗阻")
        if fitness.get("pain_score") is not None and fitness.get("pain_score") >= 4:
            constraints.append("禁止跳跃、长跑、深蹲大负荷和快速扭转")
        if screening.get("has_diabetes") or any("降糖" in str(item) or "胰岛素" in str(item) for item in medication):
            constraints.append("必须包含运动前后血糖监测提示")
        if not constraints:
            constraints.append("遵循模板、风险规则和候选动作禁忌，不得自行加入高风险动作")
        return constraints

    def _template_ref(self, template_payload: dict) -> dict:
        if template_payload.get("fallback"):
            return {
                "fallback": True,
                "fallback_reason": template_payload.get("fallback_reason"),
                "environment": template_payload.get("environment"),
                "allowed_by": template_payload.get("allowed_by"),
            }
        return {
            "id": template_payload.get("id"),
            "template_code": template_payload.get("template_code"),
            "name": template_payload.get("name"),
            "version": template_payload.get("version"),
            "source_version": template_payload.get("source_version"),
            "evidence_refs": template_payload.get("evidence_refs") or [],
        }

    def _rag_chunk_refs(self, evidence_refs: list[dict]) -> list[dict]:
        chunk_ids = [item.get("chunk_id") for item in evidence_refs if item.get("chunk_id") is not None]
        if not chunk_ids:
            return []
        chunks = {
            chunk.id: chunk
            for chunk in self.db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.id.in_(chunk_ids))).all()
        }
        document_ids = [chunk.document_id for chunk in chunks.values()]
        documents = {
            document.id: document
            for document in self.db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.id.in_(document_ids))).all()
        }
        refs: list[dict] = []
        for item in evidence_refs:
            chunk_id = item.get("chunk_id")
            chunk = chunks.get(chunk_id)
            document = documents.get(chunk.document_id) if chunk else None
            source_path = (
                document.file_path
                if document and document.file_path
                else f"knowledge_documents/{document.id}/chunks/{chunk_id}" if document else f"knowledge_chunks/{chunk_id}"
            )
            if source_path.startswith("/"):
                source_path = source_path.lstrip("/")
            refs.append(
                {
                    "document_id": item.get("document_id"),
                    "document_title": item.get("document_title"),
                    "chunk_id": chunk_id,
                    "score": item.get("score"),
                    "section": item.get("section"),
                    "page_start": item.get("page_start"),
                    "page_end": item.get("page_end"),
                    "retrieval_mode": item.get("retrieval_mode"),
                    "fallback_reason": item.get("fallback_reason"),
                    "document_status": item.get("document_status"),
                    "document_skipped_reason": item.get("document_skipped_reason"),
                    "source_path": source_path,
                    "embedding_ref": chunk.embedding_ref if chunk else None,
                }
            )
        return refs

    def _llm_model(self) -> str:
        if hasattr(self.llm_provider, "model"):
            return str(getattr(self.llm_provider, "model"))
        return settings.LLM_MODEL if self._llm_provider_name() != "mock" else "mock"

    def _llm_provider_name(self) -> str:
        provider = settings.LLM_PROVIDER.strip().lower()
        if provider:
            return provider
        return self.llm_provider.__class__.__name__

    def _rag_evidence_degraded(self, evidence: list) -> bool:
        return any(item.retrieval_mode != "vector" or item.fallback_reason for item in evidence)

    def _rag_fallback_reason(self, evidence: list) -> str | None:
        for item in evidence:
            if item.fallback_reason:
                return item.fallback_reason
            if item.retrieval_mode != "vector":
                return item.retrieval_mode
        return None

    def _fallback_allowed(self) -> bool:
        return settings.ENVIRONMENT.strip().lower() in {"development", "test"}

    def _block_generation(self, user_id: int, reason: str, metadata: dict) -> None:
        AuditService(self.db).record(
            action="PRESCRIPTION_GENERATION_BLOCKED",
            resource_type="PrescriptionRecord",
            actor_id=user_id,
            metadata={"reason": reason, **metadata},
        )
        self.db.commit()
        raise PrescriptionGenerationBlocked(reason=reason, message=self._block_message(reason))

    def _block_message(self, reason: str) -> str:
        messages = {
            "no_approved_template": "缺少已批准处方模板，生产环境不得使用通用 fallback 自动发布处方。",
            "no_candidate_actions": "缺少已批准动作候选，生产环境不得生成可执行处方。",
            "rag_evidence_empty": "未检索到可追溯 RAG 证据，生产环境不得生成可执行处方。",
            "rag_retrieval_degraded": "RAG 向量检索已降级，生产环境不得依赖关键词 fallback 自动发布处方。",
        }
        return messages.get(reason, "处方生成资料不足，已阻断。")

    def _create_record(
        self,
        user_id: int,
        template_id: int | None,
        draft: dict,
        status: str,
        llm_payload: dict,
        generation_evidence: dict | None = None,
    ) -> PrescriptionRecord:
        latest = self.db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.version.desc())
            .limit(1)
        )
        version = (latest.version + 1) if latest else 1
        if status == "PUBLISHED":
            previous_published = self.db.scalars(
                select(PrescriptionRecord).where(
                    PrescriptionRecord.user_id == user_id,
                    PrescriptionRecord.status == "PUBLISHED",
                )
            ).all()
            for previous in previous_published:
                previous.status = "SUPERSEDED"
                previous.updated_at = previous.updated_at
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
        if generation_evidence is not None:
            self.db.add(
                PrescriptionEvidence(
                    prescription_id=record.id,
                    risk_rules=generation_evidence.get("risk_rules") or [],
                    template_ref=generation_evidence.get("template_ref") or {},
                    action_refs=generation_evidence.get("action_refs") or [],
                    rag_chunks=generation_evidence.get("rag_chunks") or [],
                    llm_provider=generation_evidence.get("llm_provider") or self.llm_provider.__class__.__name__,
                    llm_model=generation_evidence.get("llm_model") or self._llm_model(),
                    schema_validation=generation_evidence.get("schema_validation") or {"passed": True},
                    safety_validation=generation_evidence.get("safety_validation") or {"passed": True},
                    object_refs=generation_evidence.get("object_refs") or [],
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
