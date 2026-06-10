import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from app.core.config import Settings, llm_api_key, runtime_provider_summary, settings


RISK_LEVELS = ("R0", "R1", "R2", "R3")
REQUIRED_ACTION_FACETS = {
    "有氧",
    "抗阻",
    "柔韧",
    "平衡",
    "呼吸训练",
    "低冲击",
    "居家",
    "器械",
    "老年友好",
}
REQUIRED_GOALS = {"减脂", "控糖", "控压", "心肺耐力", "肌力提升", "老年防跌倒", "久坐人群"}
SUPPORTED_OPERATORS = {
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in_any",
    "contains",
    "not_empty_restriction",
    "exists",
}
LIBRARY_ORDER = ("contraindications", "actions", "templates", "risk_rules")
PARTIAL_FILE_NAMES = {
    "contraindications": "ai_generated_contraindications.partial.json",
    "actions": "ai_generated_actions.partial.json",
    "templates": "ai_generated_templates.partial.json",
    "risk_rules": "ai_generated_risk_rules.partial.json",
}


@dataclass(frozen=True)
class GenerationTargets:
    contraindications: int = 60
    actions: int = 120
    templates: int = 80
    risk_rules: int = 80

    def for_library(self, library: str) -> int:
        return int(getattr(self, library))


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FITTVPItem(StrictModel):
    frequency: str = Field(min_length=1)
    intensity: str = Field(min_length=1)
    time: str = Field(min_length=1)
    type: list[str] = Field(min_length=1)
    volume: str = Field(min_length=1)
    progression: str = Field(min_length=1)


class ContraindicationItem(StrictModel):
    contraindication_code: str = Field(min_length=1, max_length=96)
    disease: str = Field(min_length=1, max_length=128)
    risk_level: Literal["R1", "R2", "R3"]
    contraindication_type: Literal["absolute", "relative"]
    forbidden_action_categories: list[str] = Field(min_length=1)
    stop_signals: list[str] = Field(min_length=1)
    referral_criteria: list[str] = Field(min_length=1)
    rationale: str = Field(min_length=1)
    evidence_refs: list[str] = Field(min_length=1)


class ExerciseActionItem(StrictModel):
    action_code: str = Field(min_length=1, max_length=96)
    name: str = Field(min_length=1, max_length=128)
    category: str = Field(min_length=1, max_length=64)
    risk_level: Literal["R0", "R1", "R2"]
    suitable_tags: list[str] = Field(min_length=1)
    contraindication_tags: list[str] = Field(default_factory=list)
    body_parts: list[str] = Field(min_length=1)
    intensity: str = Field(min_length=1, max_length=32)
    impact_level: str = Field(min_length=1, max_length=32)
    joint_stress_level: str = Field(min_length=1, max_length=32)
    requires_equipment: bool = False
    instructions: str = Field(min_length=1)
    stop_signals: list[str] = Field(min_length=1)
    evidence_refs: list[str] = Field(min_length=1)
    name_en: str | None = None
    exercise_type: str | None = None
    equipment: str | None = None
    difficulty: str | None = None
    alternatives: list[str] = Field(default_factory=list)
    common_mistakes: list[str] = Field(default_factory=list)
    monitoring_tips: list[str] = Field(default_factory=list)
    source: str | None = "ai_generated_reference_library"


class PrescriptionTemplateItem(StrictModel):
    template_code: str = Field(min_length=1, max_length=96)
    name: str = Field(min_length=1, max_length=128)
    risk_level: Literal["R0", "R1", "R2", "R3"]
    cluster_tags: list[str] = Field(min_length=1)
    goal_tags: list[str] = Field(min_length=1)
    fitt_vp: FITTVPItem | None
    precautions: list[str] = Field(min_length=1)
    contraindications: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(min_length=1)
    status: Literal["DRAFT", "APPROVED", "ARCHIVED"] = "DRAFT"
    review_status: str = "EXPERT_REVIEW_DRAFT"
    source_version: str | None = "ai-generated-v1"

    @model_validator(mode="after")
    def validate_fitt_vp_safety(self):
        if self.risk_level == "R3" and self.fitt_vp is not None:
            raise ValueError("R3 template must not include FITT-VP training content")
        if self.risk_level != "R3" and self.fitt_vp is None:
            raise ValueError("R0/R1/R2 template must include complete FITT-VP content")
        return self


class RiskRuleItem(StrictModel):
    rule_code: str = Field(min_length=1, max_length=96)
    rule_name: str = Field(min_length=1, max_length=128)
    risk_level: Literal["R0", "R1", "R2", "R3"]
    severity: Literal["GREEN", "YELLOW", "RED"]
    priority: int = Field(ge=1, le=1000)
    field_path: str = Field(min_length=1)
    operator: Literal[
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "between",
        "in_any",
        "contains",
        "not_empty_restriction",
        "exists",
    ]
    value: Any = None
    user_message: str = Field(min_length=1)
    contraindications: list[str] = Field(default_factory=list)
    intensity_cap: str | None = None
    evidence_source: str = Field(min_length=1)
    review_status: str = "EXPERT_REVIEW_DRAFT"
    applies_to: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_risk_severity_alignment(self):
        if self.risk_level == "R3" and self.severity != "RED":
            raise ValueError("R3 risk rule severity must be RED")
        if self.risk_level == "R2" and self.severity != "YELLOW":
            raise ValueError("R2 risk rule severity must be YELLOW")
        if self.risk_level in {"R0", "R1"} and self.severity not in {"GREEN", "YELLOW"}:
            raise ValueError("R0/R1 risk rule severity must not be RED")
        return self


class ReferenceBundle(StrictModel):
    contraindications: list[ContraindicationItem]
    actions: list[ExerciseActionItem]
    templates: list[PrescriptionTemplateItem]
    risk_rules: list[RiskRuleItem]


class ReferenceLLMClient(Protocol):
    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        ...


class OpenAIReferenceLLMClient:
    def __init__(
        self,
        *,
        config: Settings = settings,
        http_client: Any | None = None,
        timeout: float = 120.0,
    ) -> None:
        provider = config.LLM_PROVIDER.strip().lower()
        if provider in {"mock", "local-mock"}:
            raise ValueError("AI 参考库生成必须使用真实 LLM provider，不能使用 mock。")
        api_key, _ = llm_api_key(config)
        base_url = config.LLM_BASE_URL
        if provider in {"aliyun", "dashscope", "qwen"}:
            base_url = base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        if not base_url:
            raise ValueError("LLM_BASE_URL 未配置，无法生成 AI 参考库。")
        if not api_key:
            raise ValueError("LLM API key 未配置，无法生成 AI 参考库。")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = config.LLM_MODEL
        self.provider = provider
        self.http_client = http_client or httpx.Client()
        self.timeout = timeout

    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        response = self.http_client.post(
            self._chat_completion_url(),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": self._build_messages(library, schema, target_count, context),
                "temperature": 0.15,
                "response_format": {"type": "json_object"},
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        content = self._extract_content(response.json())
        return self._parse_json_content(content)

    def _chat_completion_url(self) -> str:
        if self.base_url.endswith("/chat/completions"):
            return self.base_url
        return f"{self.base_url}/chat/completions"

    def _build_messages(self, library: str, schema: dict, target_count: int, context: dict) -> list[dict[str, str]]:
        system = (
            "你是运动医学、慢病运动干预和医疗 SaaS 资料库建设专家。"
            "必须只输出符合 JSON Schema 的 JSON 对象，不得输出 Markdown 或解释性前后缀。"
            "所有内容必须保守、可审计、适合专家复核；R3 只允许转介/安全建议，不允许训练处方。"
        )
        user = {
            "task": "批量生成 AI 个性化运动处方平台参考资料库",
            "library": library,
            "target_count": target_count,
            "schema": schema,
            "context": context,
            "hard_constraints": [
                "不得虚构具体指南页码或 DOI；不确定时使用指南/共识名称级 evidence_refs。",
                "动作库不得包含高风险用户可直接执行的爆发、冲刺、大重量或高冲击动作。",
                "R2 只能生成专家审核初稿；R3 不生成任何 FITT-VP 训练内容。",
                "标签必须覆盖慢病、体重管理、心肺、肌力、柔韧、平衡、呼吸、居家和老年友好场景。",
            ],
        }
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ]

    def _extract_content(self, response_payload: dict) -> str:
        try:
            content = response_payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError("大模型响应缺少 choices[0].message.content") from exc
        if not isinstance(content, str) or not content.strip():
            raise ValueError("大模型响应内容为空")
        return content

    def _parse_json_content(self, content: str) -> dict:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        start = text.find("{")
        if start < 0:
            raise ValueError("大模型输出不是 JSON 对象")
        try:
            parsed, _ = json.JSONDecoder().raw_decode(text[start:])
        except json.JSONDecodeError as exc:
            raise ValueError("大模型输出不是合法 JSON") from exc
        if not isinstance(parsed, dict):
            raise ValueError("大模型输出不是 JSON 对象")
        return parsed


def validate_reference_bundle(bundle: dict[str, Any], targets: GenerationTargets | None = None) -> dict[str, Any]:
    targets = targets or GenerationTargets()
    canonical = _canonicalize_bundle(bundle)
    counts = {library: len(canonical[library]) for library in LIBRARY_ORDER}
    blocking_errors: list[str] = []
    validated: ReferenceBundle | None = None

    try:
        validated = ReferenceBundle.model_validate(canonical)
    except ValidationError as exc:
        for error in exc.errors():
            path = ".".join(str(part) for part in error.get("loc", ()))
            blocking_errors.append(f"schema: {path}: {error.get('msg')}")

    for library in LIBRARY_ORDER:
        target = targets.for_library(library)
        if counts[library] < target:
            blocking_errors.append(f"{library}: count {counts[library]} below target {target}")

    if validated is not None:
        blocking_errors.extend(_validate_duplicates(validated))
        blocking_errors.extend(_validate_action_conflicts(validated.actions))
        blocking_errors.extend(_validate_template_action_links(validated))
        blocking_errors.extend(_validate_production_coverage(validated, targets))
        coverage = _build_coverage(validated)
    else:
        coverage = _build_raw_coverage(canonical)

    return {
        "counts": counts,
        "targets": asdict(targets),
        "coverage": coverage,
        "blocking_errors": blocking_errors,
        "schema_versions": _schema_versions(),
    }


def generate_reference_libraries(
    *,
    output_dir: str | Path,
    client: ReferenceLLMClient | None = None,
    targets: GenerationTargets | None = None,
    batch_size: int | None = None,
    max_retries: int = 1,
    resume: bool = False,
) -> dict[str, Any]:
    output_path = Path(output_dir)
    targets = targets or GenerationTargets()
    client = client or OpenAIReferenceLLMClient()
    generated: dict[str, Any] = {}
    context: dict[str, Any] = _generation_context()
    output_path.mkdir(parents=True, exist_ok=True)

    for library in LIBRARY_ORDER:
        initial_items = _load_partial_items(output_path, library) if resume else []
        generated[library] = _generate_library_batches(
            library=library,
            client=client,
            target_count=targets.for_library(library),
            batch_size=batch_size,
            context=context,
            generated=generated,
            max_retries=max_retries,
            output_path=output_path,
            initial_items=initial_items,
        )

    report = validate_reference_bundle(generated, targets=targets)
    _write_json(output_path / "ai_generated_reference_validation_report.json", report)
    if report["blocking_errors"]:
        return report

    typed_bundle = ReferenceBundle.model_validate(_canonicalize_bundle(generated))
    dumped = _dump_bundle(typed_bundle)
    _write_json(output_path / "ai_generated_contraindications.json", {"items": dumped["contraindications"]})
    _write_json(output_path / "ai_generated_exercise_actions.json", {"items": dumped["actions"]})
    _write_json(output_path / "ai_generated_prescription_templates.json", {"items": dumped["templates"]})
    _write_json(output_path / "ai_generated_risk_rules.json", {"items": dumped["risk_rules"]})
    _write_json(output_path / "ai_generated_reference_bundle.json", dumped)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "scripts.generate_reference_data_with_ai",
        "runtime_provider": runtime_provider_summary(settings),
        "counts": report["counts"],
        "targets": report["targets"],
        "coverage": report["coverage"],
        "schema_versions": report["schema_versions"],
        "files": {
            "contraindications": "ai_generated_contraindications.json",
            "actions": "ai_generated_exercise_actions.json",
            "templates": "ai_generated_prescription_templates.json",
            "risk_rules": "ai_generated_risk_rules.json",
            "bundle": "ai_generated_reference_bundle.json",
            "validation_report": "ai_generated_reference_validation_report.json",
        },
        "review_status": "AI_GENERATED_PENDING_EXPERT_REVIEW",
        "demo_or_mock": False,
    }
    _write_json(output_path / "ai_generated_reference_manifest.json", manifest)
    return report


def _canonicalize_bundle(bundle: dict[str, Any]) -> dict[str, list[Any]]:
    return {library: _extract_library_items(bundle.get(library, []), library) for library in LIBRARY_ORDER}


def _generate_library_batches(
    *,
    library: str,
    client: ReferenceLLMClient,
    target_count: int,
    batch_size: int | None,
    context: dict[str, Any],
    generated: dict[str, list[Any]],
    max_retries: int,
    output_path: Path,
    initial_items: list[Any] | None = None,
) -> list[Any]:
    items: list[Any] = list(initial_items or [])
    if target_count <= 0:
        return items
    effective_batch_size = target_count if batch_size is None else max(1, min(batch_size, target_count))
    batch_index = (len(items) // effective_batch_size) + 1
    while len(items) < target_count:
        remaining = target_count - len(items)
        requested = min(effective_batch_size, remaining)
        batch_context = {
            **context,
            "already_generated": _context_from_generated({**generated, library: items}),
            "batch_index": batch_index,
            "remaining_target_count": remaining,
            "existing_codes": _existing_codes(library, items),
            "existing_names": _existing_names(library, items),
        }
        payload = _complete_json_with_retries(
            client=client,
            library=library,
            schema=_schema_for_library(library),
            target_count=requested,
            context=batch_context,
            max_retries=max_retries,
        )
        items.extend(_extract_library_items(payload, library))
        _write_partial_items(output_path, library, items)
        if requested > 0 and not _extract_library_items(payload, library):
            break
        batch_index += 1
    return items


def _complete_json_with_retries(
    *,
    client: ReferenceLLMClient,
    library: str,
    schema: dict,
    target_count: int,
    context: dict,
    max_retries: int,
) -> dict:
    attempts = max(0, max_retries) + 1
    last_exc: Exception | None = None
    for _ in range(attempts):
        try:
            return client.complete_json(
                library=library,
                schema=schema,
                target_count=target_count,
                context=context,
            )
        except Exception as exc:  # pragma: no cover - exact provider failures vary by runtime
            last_exc = exc
    assert last_exc is not None
    raise last_exc


def _existing_codes(library: str, items: list[Any]) -> list[str]:
    code_fields = {
        "contraindications": ("contraindication_code",),
        "actions": ("action_code",),
        "templates": ("template_code",),
        "risk_rules": ("rule_code", "code"),
    }[library]
    codes: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for field in code_fields:
            value = item.get(field)
            if value:
                codes.append(str(value))
                break
    return codes


def _existing_names(library: str, items: list[Any]) -> list[str]:
    name_fields = {
        "contraindications": ("disease",),
        "actions": ("name",),
        "templates": ("name",),
        "risk_rules": ("rule_name", "name"),
    }[library]
    names: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for field in name_fields:
            value = item.get(field)
            if value:
                names.append(str(value))
                break
    return names


def _extract_library_items(payload: Any, library: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    aliases = {
        "contraindications": ("contraindications", "items"),
        "actions": ("actions", "exercise_actions", "items"),
        "templates": ("templates", "prescription_templates", "items"),
        "risk_rules": ("risk_rules", "rules", "items"),
    }[library]
    for key in aliases:
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _load_partial_items(output_path: Path, library: str) -> list[Any]:
    partial_path = output_path / PARTIAL_FILE_NAMES[library]
    if not partial_path.exists():
        return []
    try:
        payload = json.loads(partial_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return _extract_library_items(payload, library)


def _write_partial_items(output_path: Path, library: str, items: list[Any]) -> None:
    _write_json(output_path / PARTIAL_FILE_NAMES[library], {"items": items})


def _validate_duplicates(bundle: ReferenceBundle) -> list[str]:
    errors: list[str] = []
    errors.extend(_duplicate_errors("contraindications", "contraindication_code", [item.contraindication_code for item in bundle.contraindications]))
    errors.extend(_duplicate_errors("actions", "action_code", [item.action_code for item in bundle.actions]))
    errors.extend(_duplicate_errors("actions", "name", [item.name for item in bundle.actions]))
    errors.extend(_duplicate_errors("templates", "template_code", [item.template_code for item in bundle.templates]))
    errors.extend(_duplicate_errors("risk_rules", "rule_code", [item.rule_code for item in bundle.risk_rules]))
    return errors


def _duplicate_errors(library: str, field: str, values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        normalized = value.strip().lower()
        if normalized in seen:
            duplicates.add(value)
        seen.add(normalized)
    return [f"{library}: duplicate {field} {value}" for value in sorted(duplicates)]


def _validate_action_conflicts(actions: list[ExerciseActionItem]) -> list[str]:
    errors: list[str] = []
    for action in actions:
        overlap = set(action.suitable_tags) & set(action.contraindication_tags)
        if overlap:
            errors.append(f"actions.{action.action_code}: suitable/contraindication conflict {sorted(overlap)}")
    return errors


def _validate_template_action_links(bundle: ReferenceBundle) -> list[str]:
    action_names = {action.name for action in bundle.actions}
    errors: list[str] = []
    for template in bundle.templates:
        if template.risk_level == "R3" or template.fitt_vp is None:
            continue
        missing = [name for name in template.fitt_vp.type if name not in action_names]
        if missing:
            errors.append(f"templates.{template.template_code}: FITT-VP references unknown actions {missing}")
    return errors


def _validate_production_coverage(bundle: ReferenceBundle, targets: GenerationTargets) -> list[str]:
    coverage = _build_coverage(bundle)
    errors: list[str] = []
    if targets.actions >= len(REQUIRED_ACTION_FACETS):
        missing = REQUIRED_ACTION_FACETS - set(coverage["action_facets"])
        if missing:
            errors.append(f"coverage: missing action facets {sorted(missing)}")
    if targets.templates >= len(REQUIRED_GOALS):
        missing = REQUIRED_GOALS - set(coverage["goals"])
        if missing:
            errors.append(f"coverage: missing goals {sorted(missing)}")
    if targets.templates >= len(RISK_LEVELS):
        missing = set(RISK_LEVELS) - set(coverage["risk_levels"])
        if missing:
            errors.append(f"coverage: missing risk levels {sorted(missing)}")
    return errors


def _build_coverage(bundle: ReferenceBundle) -> dict[str, list[str]]:
    action_facets: set[str] = set()
    for action in bundle.actions:
        action_facets.add(action.category)
        action_facets.update(action.suitable_tags)
        if action.requires_equipment:
            action_facets.add("器械")
    risk_levels = {
        *(item.risk_level for item in bundle.contraindications),
        *(item.risk_level for item in bundle.actions),
        *(item.risk_level for item in bundle.templates),
        *(item.risk_level for item in bundle.risk_rules),
    }
    return {
        "action_facets": sorted(action_facets),
        "goals": sorted({goal for template in bundle.templates for goal in template.goal_tags}),
        "risk_levels": sorted(risk_levels),
        "rule_operators": sorted({rule.operator for rule in bundle.risk_rules}),
        "diseases": sorted({item.disease for item in bundle.contraindications}),
    }


def _build_raw_coverage(canonical: dict[str, list[Any]]) -> dict[str, list[str]]:
    action_facets: set[str] = set()
    goals: set[str] = set()
    risk_levels: set[str] = set()
    operators: set[str] = set()
    diseases: set[str] = set()
    for item in canonical["actions"]:
        if isinstance(item, dict):
            action_facets.add(str(item.get("category") or ""))
            action_facets.update(str(tag) for tag in item.get("suitable_tags") or [])
            risk_levels.add(str(item.get("risk_level") or ""))
    for item in canonical["templates"]:
        if isinstance(item, dict):
            goals.update(str(tag) for tag in item.get("goal_tags") or [])
            risk_levels.add(str(item.get("risk_level") or ""))
    for item in canonical["risk_rules"]:
        if isinstance(item, dict):
            risk_levels.add(str(item.get("risk_level") or ""))
            operators.add(str(item.get("operator") or ""))
    for item in canonical["contraindications"]:
        if isinstance(item, dict):
            risk_levels.add(str(item.get("risk_level") or ""))
            diseases.add(str(item.get("disease") or ""))
    return {
        "action_facets": sorted(item for item in action_facets if item),
        "goals": sorted(item for item in goals if item),
        "risk_levels": sorted(item for item in risk_levels if item),
        "rule_operators": sorted(item for item in operators if item),
        "diseases": sorted(item for item in diseases if item),
    }


def _dump_bundle(bundle: ReferenceBundle) -> dict[str, list[dict[str, Any]]]:
    return {
        "contraindications": [item.model_dump(mode="json", exclude_none=True) for item in bundle.contraindications],
        "actions": [item.model_dump(mode="json", exclude_none=True) for item in bundle.actions],
        "templates": [item.model_dump(mode="json", exclude_none=False) for item in bundle.templates],
        "risk_rules": [item.model_dump(mode="json", exclude_none=True) for item in bundle.risk_rules],
    }


def _schema_for_library(library: str) -> dict[str, Any]:
    envelope_models = {
        "contraindications": ContraindicationEnvelope,
        "actions": ActionEnvelope,
        "templates": TemplateEnvelope,
        "risk_rules": RiskRuleEnvelope,
    }
    return envelope_models[library].model_json_schema()


class ContraindicationEnvelope(StrictModel):
    contraindications: list[ContraindicationItem]


class ActionEnvelope(StrictModel):
    actions: list[ExerciseActionItem]


class TemplateEnvelope(StrictModel):
    templates: list[PrescriptionTemplateItem]


class RiskRuleEnvelope(StrictModel):
    risk_rules: list[RiskRuleItem]


def _schema_versions() -> dict[str, str]:
    return {library: _schema_version(_schema_for_library(library)) for library in LIBRARY_ORDER}


def _schema_version(schema: dict[str, Any]) -> str:
    serialized = json.dumps(schema, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]
    title = schema.get("title") or "schema"
    return f"pydantic-json-schema:{title}:{digest}"


def _generation_context() -> dict[str, Any]:
    return {
        "required_action_facets": sorted(REQUIRED_ACTION_FACETS),
        "required_goals": sorted(REQUIRED_GOALS),
        "risk_levels": list(RISK_LEVELS),
        "supported_rule_operators": sorted(SUPPORTED_OPERATORS),
        "platform_boundaries": {
            "R0_R1": "可以生成完整 FITT-VP，仍需保守强度和停止条件。",
            "R2": "只能生成专家审核初稿，发布前强制专家确认。",
            "R3": "只生成医学评估/转介建议，不生成训练动作、强度、组数或进阶计划。",
        },
    }


def _context_from_generated(generated: dict[str, list[Any]]) -> dict[str, Any]:
    return {
        "action_names": [item.get("name") for item in generated.get("actions", []) if isinstance(item, dict)],
        "template_codes": [item.get("template_code") for item in generated.get("templates", []) if isinstance(item, dict)],
        "rule_codes": [item.get("rule_code") for item in generated.get("risk_rules", []) if isinstance(item, dict)],
    }


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="使用真实 LLM 批量生成并校验运动处方参考资料库。")
    parser.add_argument("--output-dir", type=Path, default=Path("docs/ai_generated"), help="输出目录。")
    parser.add_argument("--contraindications", type=int, default=GenerationTargets.contraindications)
    parser.add_argument("--actions", type=int, default=GenerationTargets.actions)
    parser.add_argument("--templates", type=int, default=GenerationTargets.templates)
    parser.add_argument("--risk-rules", type=int, default=GenerationTargets.risk_rules)
    parser.add_argument("--batch-size", type=int, default=None, help="每次 LLM 调用生成的条目数；不改变总目标数。")
    parser.add_argument("--max-retries", type=int, default=1, help="每个 LLM 批次失败后的最大重试次数。")
    parser.add_argument("--timeout", type=float, default=120.0, help="单次 LLM 请求超时时间，单位秒。")
    parser.add_argument("--resume", action="store_true", help="从输出目录中的 partial 文件继续生成。")
    parser.add_argument("--json", action="store_true", help="只输出机器可读 JSON 报告。")
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    report = generate_reference_libraries(
        output_dir=args.output_dir,
        client=OpenAIReferenceLLMClient(timeout=args.timeout),
        targets=GenerationTargets(
            contraindications=args.contraindications,
            actions=args.actions,
            templates=args.templates,
            risk_rules=args.risk_rules,
        ),
        batch_size=args.batch_size,
        max_retries=args.max_retries,
        resume=args.resume,
    )
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("AI reference library generation report:")
        print(f"- counts: {report['counts']}")
        if report["blocking_errors"]:
            print("- blocking_errors:")
            for error in report["blocking_errors"]:
                print(f"  - {error}")
    return 1 if report["blocking_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
