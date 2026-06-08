import argparse
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()


REFERENCE_JSON_FILES = {
    "risk_rules": "docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json",
    "actions": "docs/ai_exercise_action_library_v0_1_expert_review_draft.json",
    "templates": "docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json",
    "compliance": "docs/ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json",
    "knowledge_catalog": "docs/knowledge_source_catalog_v0_2.json",
}
AI_GENERATED_JSON_FILES = {
    "contraindications": "ai_generated_contraindications.json",
    "actions": "ai_generated_exercise_actions.json",
    "templates": "ai_generated_prescription_templates.json",
    "risk_rules": "ai_generated_risk_rules.json",
    "manifest": "ai_generated_reference_manifest.json",
}
RAG_ALLOWLIST_PATH = "rag_data/_manifests/rag_ingest_allowlist.txt"
FORMAL_MINIMUM_COUNTS = {
    "contraindications": 60,
    "actions": 120,
    "templates": 16,
    "risk_rules": 80,
}
FORMAL_REQUIRED_RISK_LEVELS = ("R0", "R1", "R2", "R3")
FORMAL_REQUIRED_CONTRAINDICATION_RISK_LEVELS = ("R2", "R3")
FORMAL_REQUIRED_CONTRAINDICATION_TYPES = ("absolute", "relative")
FORMAL_REQUIRED_CONTRAINDICATION_FIELDS = (
    "contraindication_code",
    "disease",
    "risk_level",
    "contraindication_type",
    "forbidden_action_categories",
    "stop_signals",
    "referral_criteria",
    "rationale",
    "evidence_refs",
)
FORMAL_CONTRAINDICATION_FILE_CANDIDATES = (
    "ai_generated/ai_generated_contraindications.json",
    "ai_generated/ai_generated_contraindications.partial.json",
    "ai_generated_contraindications.json",
    "ai_generated_contraindications.partial.json",
)
FORMAL_CONTRAINDICATION_MINIMUM_DISTINCTS = {
    "diseases": 40,
    "forbidden_action_categories": 20,
    "stop_signals": 20,
    "referral_criteria": 20,
}
FORMAL_REQUIRED_ACTION_FACET_GROUPS = {
    "有氧": ("有氧", "有氧训练", "心肺"),
    "抗阻": ("抗阻", "抗阻训练", "肌力", "力量"),
    "柔韧": ("柔韧", "拉伸", "关节活动度"),
    "平衡": ("平衡", "跌倒", "站立稳定"),
    "呼吸训练": ("呼吸训练", "呼吸", "缩唇呼吸", "腹式呼吸"),
    "低冲击": ("低冲击", "低影响", "无冲击"),
    "居家": ("居家", "室内", "徒手", "扶椅", "椅子", "家中"),
    "器械": ("器械", "弹力带", "哑铃", "固定自行车", "椭圆机", "踏步机", "requires_equipment"),
    "老年友好": ("老年友好", "老年", "防跌倒", "扶椅", "低体能"),
}
FORMAL_REQUIRED_GOAL_GROUPS = {
    "减脂": ("减脂", "体重管理", "超重肥胖", "脂肪"),
    "控糖": ("控糖", "血糖管理辅助", "胰岛素敏感性", "糖代谢"),
    "控压": ("控压", "血压管理辅助", "高血压", "血压"),
    "心肺耐力": ("心肺耐力", "心肺体能", "心肺提升", "有氧耐力", "低冲击心肺", "低强度心肺"),
    "肌力提升": ("肌力提升", "肌力维护", "肌力维持", "肌肉保留", "下肢力量", "力量"),
    "老年防跌倒": ("老年防跌倒", "防跌倒", "跌倒预防", "跌倒风险降低", "跌倒风险"),
    "久坐人群": ("久坐人群", "久坐减少", "打断久坐", "久坐低体能"),
}
FORMAL_REQUIRED_ACTION_FIELDS = (
    "action_code",
    "name",
    "category",
    "risk_level",
    "suitable_tags",
    "contraindication_tags",
    "body_parts",
    "intensity",
    "impact_level",
    "joint_stress_level",
    "instructions",
    "stop_signals",
    "evidence_refs",
)


def _default_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2]


def _load_json(path: Path, key: str, missing_files: list[str], blocking_errors: list[str]) -> Any:
    if not path.exists():
        missing_files.append(str(path))
        blocking_errors.append(f"{key}: missing file {path}")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        blocking_errors.append(f"{key}: invalid JSON at line {exc.lineno}, column {exc.colno}")
        return None
    if not data:
        blocking_errors.append(f"{key}: top-level JSON is empty")
    return data


def _count_items(data: Any, preferred_keys: tuple[str, ...] = ()) -> int:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for key in preferred_keys:
            value = data.get(key)
            if isinstance(value, list):
                return len(value)
        return len(data) if data else 0
    return 0


def _read_allowlist(
    project_root: Path,
    rag_root: Path,
    missing_files: list[str],
    blocking_errors: list[str],
    absolute_allowlist_paths: list[str],
    *,
    strict: bool,
) -> list[str]:
    allowlist_path = rag_root / "_manifests" / "rag_ingest_allowlist.txt"
    if not allowlist_path.exists():
        missing_files.append(str(allowlist_path))
        blocking_errors.append(f"rag_allowlist: missing file {allowlist_path}")
        return []

    entries: list[str] = []
    for raw_line in allowlist_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        entries.append(line)
        raw_candidate = Path(line)
        if raw_candidate.is_absolute():
            absolute_allowlist_paths.append(line)
            if strict:
                blocking_errors.append(f"rag_allowlist: allowlist contains absolute path {line}")
        candidate = _resolve_allowlist_entry(project_root, rag_root, line)
        if not candidate.exists():
            missing_files.append(str(candidate))
            blocking_errors.append(f"rag_allowlist: missing referenced file {line}")
    return entries


def _resolve_allowlist_entry(project_root: Path, rag_root: Path, line: str) -> Path:
    candidate = Path(line)
    if candidate.exists():
        return candidate
    if not candidate.is_absolute():
        relative_candidate = project_root / line
        if relative_candidate.exists():
            return relative_candidate
        return rag_root / line

    parts = candidate.parts
    if "rag_data" in parts:
        rag_index = parts.index("rag_data")
        return project_root.joinpath(*parts[rag_index:])
    return candidate


def validate_reference_data(
    project_root: str | Path | None = None,
    *,
    docs_dir: str | Path | None = None,
    rag_root: str | Path | None = None,
    ai_bundle_dir: str | Path | None = None,
    strict: bool = False,
    database_url: str | None = None,
) -> dict[str, Any]:
    root = Path(project_root).resolve() if project_root is not None else _default_project_root()
    docs_path = Path(docs_dir).resolve() if docs_dir is not None else root / "docs"
    rag_path = Path(rag_root).resolve() if rag_root is not None else root / "rag_data"
    ai_path = Path(ai_bundle_dir).resolve() if ai_bundle_dir is not None else None
    missing_files: list[str] = []
    blocking_errors: list[str] = []
    absolute_allowlist_paths: list[str] = []

    loaded = {
        key: _load_json(docs_path / Path(relative_path).name, key, missing_files, blocking_errors)
        for key, relative_path in REFERENCE_JSON_FILES.items()
    }
    loaded["contraindications"] = _load_optional_contraindications(docs_path)
    allowlist_entries = _read_allowlist(
        root,
        rag_path,
        missing_files,
        blocking_errors,
        absolute_allowlist_paths,
        strict=strict,
    )
    knowledge_index_errors = _validate_knowledge_index_state(
        database_url=database_url or os.environ.get("DATABASE_URL_FOR_REFERENCE_VALIDATION"),
        strict=strict,
    )
    blocking_errors.extend(knowledge_index_errors)
    ai_generated_reference = (
        _validate_ai_generated_reference(ai_path, missing_files, blocking_errors) if ai_path is not None else None
    )
    formal_reference_coverage = _build_formal_reference_coverage(loaded)
    blocking_errors.extend(formal_reference_coverage["blocking_errors"])

    return {
        "project_root": str(root),
        "docs_dir": str(docs_path),
        "rag_root": str(rag_path),
        "ai_bundle_dir": str(ai_path) if ai_path is not None else None,
        "risk_rules_count": _count_items(loaded["risk_rules"], ("rules", "items")),
        "actions_count": _count_items(loaded["actions"], ("actions", "items")),
        "templates_count": _count_items(loaded["templates"], ("templates", "items")),
        "compliance_documents_count": _count_items(loaded["compliance"], ("documents",)),
        "knowledge_sources_count": _count_items(loaded["knowledge_catalog"], ("sources", "items")),
        "rag_allowlist_count": len(allowlist_entries),
        "ai_generated_reference": ai_generated_reference,
        "formal_reference_coverage": formal_reference_coverage,
        "absolute_allowlist_paths": absolute_allowlist_paths,
        "missing_files": missing_files,
        "knowledge_index_errors": knowledge_index_errors,
        "blocking_errors": blocking_errors,
    }



def _load_optional_contraindications(docs_path: Path) -> Any:
    for relative_path in FORMAL_CONTRAINDICATION_FILE_CANDIDATES:
        path = docs_path / relative_path
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return None
    return None


def _build_formal_reference_coverage(loaded: dict[str, Any]) -> dict[str, Any]:
    actions = _items_from_split(loaded.get("actions"), ("actions", "items"))
    templates = _items_from_split(loaded.get("templates"), ("templates", "items"))
    risk_rules = _items_from_split(loaded.get("risk_rules"), ("rules", "risk_rules", "items"))
    contraindications = _items_from_split(loaded.get("contraindications"), ("contraindications", "items"))

    matched_action_facets = _match_required_groups(
        actions,
        FORMAL_REQUIRED_ACTION_FACET_GROUPS,
        fields=(
            "name",
            "category",
            "exercise_type",
            "equipment",
            "body_parts",
            "primary_muscles",
            "suitable_tags",
            "contraindication_tags",
            "impact_level",
            "joint_stress_level",
        ),
        include_equipment_flag=True,
    )
    matched_goal_groups = _match_required_groups(
        templates,
        FORMAL_REQUIRED_GOAL_GROUPS,
        fields=("name", "goal_tags", "cluster_tags", "precautions", "contraindications"),
    )
    action_quality = _validate_formal_action_quality(actions)
    contraindication_coverage = _build_contraindication_coverage(contraindications)
    present_risk_levels = sorted(
        {
            level
            for item in [*actions, *templates, *risk_rules]
            if isinstance(item, dict)
            for level in _risk_levels_from_value(item.get("risk_level"))
        }
    )
    minimum_counts = {
        "actions": _minimum_count_report(len(actions), FORMAL_MINIMUM_COUNTS["actions"]),
        "templates": _minimum_count_report(len(templates), FORMAL_MINIMUM_COUNTS["templates"]),
        "risk_rules": _minimum_count_report(len(risk_rules), FORMAL_MINIMUM_COUNTS["risk_rules"]),
    }
    missing_action_facets = sorted(set(FORMAL_REQUIRED_ACTION_FACET_GROUPS) - set(matched_action_facets))
    missing_goal_groups = {
        group: list(FORMAL_REQUIRED_GOAL_GROUPS[group])
        for group in sorted(set(FORMAL_REQUIRED_GOAL_GROUPS) - set(matched_goal_groups))
    }
    missing_risk_levels = sorted(set(FORMAL_REQUIRED_RISK_LEVELS) - set(present_risk_levels))
    blocking_errors: list[str] = []
    if missing_action_facets:
        blocking_errors.append(f"formal_reference_coverage: missing action facets {missing_action_facets}")
    if missing_goal_groups:
        blocking_errors.append(f"formal_reference_coverage: missing goal groups {sorted(missing_goal_groups)}")
    if missing_risk_levels:
        blocking_errors.append(f"formal_reference_coverage: missing risk levels {missing_risk_levels}")
    if contraindication_coverage["blocking_errors"]:
        blocking_errors.extend(
            f"formal_reference_coverage: {error}" for error in contraindication_coverage["blocking_errors"]
        )
    for library, report in minimum_counts.items():
        if not report["ok"]:
            blocking_errors.append(
                f"formal_reference_coverage: {library} count {report['actual']} below required {report['required']}"
            )
    for field, codes in action_quality["missing_required_fields"].items():
        if codes:
            blocking_errors.append(
                f"formal_reference_coverage: missing required action fields {field} for {len(codes)} actions"
            )
    if action_quality["duplicate_action_codes"]:
        blocking_errors.append(
            f"formal_reference_coverage: duplicate action codes {action_quality['duplicate_action_codes']}"
        )
    if action_quality["duplicate_action_names"]:
        blocking_errors.append(
            f"formal_reference_coverage: duplicate action names {action_quality['duplicate_action_names']}"
        )
    blocking_errors.extend(f"formal_reference_coverage: {error}" for error in action_quality["conflicts"])

    return {
        "minimum_counts": minimum_counts,
        "contraindication_coverage": contraindication_coverage,
        "matched_action_facets": matched_action_facets,
        "missing_action_facets": missing_action_facets,
        "matched_goal_groups": matched_goal_groups,
        "missing_goal_groups": missing_goal_groups,
        "present_risk_levels": present_risk_levels,
        "missing_risk_levels": missing_risk_levels,
        "action_quality": action_quality,
        "blocking_errors": blocking_errors,
    }



def _build_contraindication_coverage(items: list[Any]) -> dict[str, Any]:
    by_risk_level = Counter()
    by_type = Counter()
    diseases: set[str] = set()
    forbidden_action_categories: set[str] = set()
    stop_signals: set[str] = set()
    referral_criteria: set[str] = set()
    missing_required_fields: dict[str, list[str]] = {
        field: [] for field in FORMAL_REQUIRED_CONTRAINDICATION_FIELDS
    }
    duplicate_codes: list[str] = []
    seen_codes: set[str] = set()

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        code = str(
            item.get("contraindication_code") or item.get("disease") or f"#{index}"
        ).strip()
        normalized_code = code.lower()
        if normalized_code in seen_codes:
            duplicate_codes.append(code)
        seen_codes.add(normalized_code)
        for field in FORMAL_REQUIRED_CONTRAINDICATION_FIELDS:
            if not _has_reference_value(item.get(field)):
                missing_required_fields[field].append(code)
        risk_level = str(item.get("risk_level") or "").strip()
        contraindication_type = str(item.get("contraindication_type") or "").strip()
        if risk_level:
            by_risk_level[risk_level] += 1
        if contraindication_type:
            by_type[contraindication_type] += 1
        disease = str(item.get("disease") or "").strip()
        if disease:
            diseases.add(disease)
        forbidden_action_categories.update(_string_list(item.get("forbidden_action_categories")))
        stop_signals.update(_string_list(item.get("stop_signals")))
        referral_criteria.update(_string_list(item.get("referral_criteria")))

    missing_required_fields = {
        field: codes for field, codes in missing_required_fields.items() if codes
    }
    minimum_count = _minimum_count_report(
        len(items), FORMAL_MINIMUM_COUNTS["contraindications"]
    )
    distinct_counts = {
        "diseases": len(diseases),
        "forbidden_action_categories": len(forbidden_action_categories),
        "stop_signals": len(stop_signals),
        "referral_criteria": len(referral_criteria),
    }
    distinct_minimums = {
        key: _minimum_count_report(value, FORMAL_CONTRAINDICATION_MINIMUM_DISTINCTS[key])
        for key, value in distinct_counts.items()
    }
    missing_required_risk_levels = sorted(
        set(FORMAL_REQUIRED_CONTRAINDICATION_RISK_LEVELS) - set(by_risk_level)
    )
    missing_required_types = sorted(
        set(FORMAL_REQUIRED_CONTRAINDICATION_TYPES) - set(by_type)
    )
    blocking_errors: list[str] = []
    if not minimum_count["ok"]:
        blocking_errors.append(
            f"contraindications count {minimum_count['actual']} below required {minimum_count['required']}"
        )
    for key, report in distinct_minimums.items():
        if not report["ok"]:
            blocking_errors.append(
                f"contraindications {key} {report['actual']} below required {report['required']}"
            )
    if missing_required_risk_levels:
        blocking_errors.append(f"contraindications missing risk levels {missing_required_risk_levels}")
    if missing_required_types:
        blocking_errors.append(f"contraindications missing types {missing_required_types}")
    for field, codes in missing_required_fields.items():
        if codes:
            blocking_errors.append(
                f"contraindications missing required fields {field} for {len(codes)} items"
            )
    if duplicate_codes:
        blocking_errors.append(f"contraindications duplicate codes {sorted(duplicate_codes)}")

    return {
        "minimum_count": minimum_count,
        "by_risk_level": dict(sorted(by_risk_level.items())),
        "by_type": dict(sorted(by_type.items())),
        "disease_count": len(diseases),
        "forbidden_action_category_count": len(forbidden_action_categories),
        "stop_signal_count": len(stop_signals),
        "referral_criteria_count": len(referral_criteria),
        "distinct_minimums": distinct_minimums,
        "missing_required_risk_levels": missing_required_risk_levels,
        "missing_required_types": missing_required_types,
        "missing_required_fields": missing_required_fields,
        "duplicate_codes": sorted(duplicate_codes),
        "sample_diseases": sorted(diseases)[:20],
        "sample_forbidden_action_categories": sorted(forbidden_action_categories)[:30],
        "sample_stop_signals": sorted(stop_signals)[:20],
        "sample_referral_criteria": sorted(referral_criteria)[:20],
        "blocking_errors": blocking_errors,
    }


def _minimum_count_report(actual: int, required: int) -> dict[str, int | bool]:
    return {"actual": actual, "required": required, "ok": actual >= required}


def _validate_formal_action_quality(actions: list[Any]) -> dict[str, Any]:
    missing_required_fields: dict[str, list[str]] = {field: [] for field in FORMAL_REQUIRED_ACTION_FIELDS}
    action_codes: list[str] = []
    action_names: list[str] = []
    conflicts: list[str] = []

    for index, item in enumerate(actions, start=1):
        if not isinstance(item, dict):
            continue
        action_code = str(item.get("action_code") or item.get("source_exercise_id") or item.get("name") or f"#{index}").strip()
        action_name = str(item.get("name") or action_code).strip()
        if item.get("action_code"):
            action_codes.append(str(item["action_code"]).strip())
        if item.get("name"):
            action_names.append(str(item["name"]).strip())
        for field in FORMAL_REQUIRED_ACTION_FIELDS:
            if not _has_reference_value(item.get(field)):
                missing_required_fields[field].append(action_code)
        overlap = set(_string_list(item.get("suitable_tags"))) & set(_string_list(item.get("contraindication_tags")))
        if overlap:
            conflicts.append(
                f"actions.{action_code}: suitable/contraindication conflict {sorted(overlap)}"
            )

    return {
        "missing_required_fields": {field: values for field, values in missing_required_fields.items() if values},
        "duplicate_action_codes": _duplicates(action_codes),
        "duplicate_action_names": _duplicates(action_names),
        "conflicts": conflicts,
    }


def _has_reference_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        normalized = value.strip().lower()
        if not normalized:
            continue
        if normalized in seen:
            duplicates.add(value)
        seen.add(normalized)
    return sorted(duplicates)


def _match_required_groups(
    items: list[Any],
    groups: dict[str, tuple[str, ...]],
    *,
    fields: tuple[str, ...],
    include_equipment_flag: bool = False,
) -> dict[str, list[str]]:
    matched: dict[str, set[str]] = {group: set() for group in groups}
    for item in items:
        if not isinstance(item, dict):
            continue
        text = _reference_item_text(item, fields)
        if include_equipment_flag and item.get("requires_equipment") is True:
            text = f"{text} requires_equipment 器械"
        for group, aliases in groups.items():
            for alias in aliases:
                if alias and alias in text:
                    matched[group].add(alias)
    return {group: sorted(aliases) for group, aliases in matched.items() if aliases}


def _reference_item_text(item: dict[str, Any], fields: tuple[str, ...]) -> str:
    return " ".join(_flatten_reference_text(item.get(field)) for field in fields)


def _flatten_reference_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(_flatten_reference_text(item) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten_reference_text(item) for item in value)
    return str(value)


def _risk_levels_from_value(value: Any) -> list[str]:
    text = str(value or "")
    return [level for level in FORMAL_REQUIRED_RISK_LEVELS if level in text]


def _validate_ai_generated_reference(
    ai_bundle_dir: Path,
    missing_files: list[str],
    blocking_errors: list[str],
) -> dict[str, Any]:
    from scripts.generate_reference_data_with_ai import GenerationTargets, validate_reference_bundle

    loaded = {
        key: _load_json(ai_bundle_dir / file_name, f"ai_generated.{key}", missing_files, blocking_errors)
        for key, file_name in AI_GENERATED_JSON_FILES.items()
    }
    bundle = {
        "contraindications": _items_from_split(loaded["contraindications"], ("items", "contraindications")),
        "actions": _items_from_split(loaded["actions"], ("items", "actions")),
        "templates": _items_from_split(loaded["templates"], ("items", "templates")),
        "risk_rules": _items_from_split(loaded["risk_rules"], ("items", "rules", "risk_rules")),
    }
    targets = _targets_from_manifest(loaded["manifest"], bundle)
    report = validate_reference_bundle(bundle, targets=targets)
    blocking_errors.extend(f"ai_generated.{error}" for error in report["blocking_errors"])
    return report


def _items_from_split(data: Any, preferred_keys: tuple[str, ...]) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in preferred_keys:
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def _targets_from_manifest(manifest: Any, bundle: dict[str, list[Any]]) -> "GenerationTargets":
    from scripts.generate_reference_data_with_ai import GenerationTargets

    if isinstance(manifest, dict) and isinstance(manifest.get("targets"), dict):
        raw_targets = manifest["targets"]
        return GenerationTargets(
            contraindications=int(raw_targets.get("contraindications") or len(bundle["contraindications"])),
            actions=int(raw_targets.get("actions") or len(bundle["actions"])),
            templates=int(raw_targets.get("templates") or len(bundle["templates"])),
            risk_rules=int(raw_targets.get("risk_rules") or len(bundle["risk_rules"])),
        )
    return GenerationTargets(
        contraindications=len(bundle["contraindications"]),
        actions=len(bundle["actions"]),
        templates=len(bundle["templates"]),
        risk_rules=len(bundle["risk_rules"]),
    )


def _validate_knowledge_index_state(database_url: str | None, *, strict: bool) -> list[str]:
    if not strict or not database_url:
        return []
    try:
        from sqlalchemy import create_engine, func, select
        from sqlalchemy.orm import Session

        from app.models.template import KnowledgeChunk, KnowledgeDocument
    except Exception as exc:
        return [f"knowledge_index: cannot import database models: {exc}"]

    engine = create_engine(database_url)
    errors: list[str] = []
    with Session(engine) as session:
        rows = session.execute(
            select(KnowledgeDocument.id, KnowledgeDocument.title, func.count(KnowledgeChunk.id))
            .join(KnowledgeChunk, KnowledgeChunk.document_id == KnowledgeDocument.id)
            .where(
                KnowledgeDocument.status == "ACTIVE",
                KnowledgeDocument.skipped_reason.is_(None),
                KnowledgeChunk.embedding_ref.is_(None),
            )
            .group_by(KnowledgeDocument.id, KnowledgeDocument.title)
        ).all()
        for document_id, title, count in rows:
            errors.append(
                f"knowledge_index: ACTIVE document {document_id} ({title}) has {count} unindexed chunks and no failure reason"
            )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="校验 docs 与 rag_data 参考资料覆盖率。")
    parser.add_argument("--project-root", type=Path, default=None, help="项目根目录，默认自动从脚本路径定位。")
    parser.add_argument("--ai-bundle-dir", type=Path, default=None, help="可选：校验 AI 生成参考资料 split 文件目录。")
    parser.add_argument("--json", action="store_true", help="输出机器可读 JSON。")
    parser.add_argument("--strict", action="store_true", help="存在关键资料缺失或解析错误时返回非 0。")
    args = parser.parse_args()

    result = validate_reference_data(args.project_root, ai_bundle_dir=args.ai_bundle_dir, strict=args.strict)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("Reference data coverage:")
        for key, value in result.items():
            if key.endswith("_count"):
                print(f"- {key}: {value}")
        if result["blocking_errors"]:
            print("Blocking errors:")
            for error in result["blocking_errors"]:
                print(f"- {error}")
    return 1 if args.strict and result["blocking_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
