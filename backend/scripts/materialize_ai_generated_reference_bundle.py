import argparse
import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from app.core.config import runtime_provider_summary, settings
from scripts.generate_reference_data_with_ai import (
    GenerationTargets,
    ReferenceBundle,
    _schema_versions,
    validate_reference_bundle,
)


FORMAL_ACTIONS_FILE = "ai_exercise_action_library_v0_1_expert_review_draft.json"
FORMAL_TEMPLATES_FILE = "ai_exercise_prescription_template_library_v0_1_expert_review_draft.json"
FORMAL_RISK_RULES_FILE = "ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json"
CONTRAINDICATION_PARTIAL_FILE = "ai_generated_contraindications.partial.json"

STOP_SIGNALS = [
    "胸痛、胸闷或胸部压迫感",
    "晕厥、黑蒙、明显头晕或站立不稳",
    "异常或严重气短、喘憋、静息不能缓解",
    "明显心悸、心跳不规则感或伴随不适",
    "疼痛快速加重或疼痛≥7/10",
]

ACTION_KEYWORDS = {
    "骑行": ("骑行", "自行车", "固定车", "靠背车"),
    "固定车": ("骑行", "自行车", "固定车", "靠背车"),
    "椭圆机": ("椭圆机",),
    "游泳": ("水中", "游泳"),
    "水中": ("水中", "游泳"),
    "步行": ("快走", "慢走", "步行", "原地踏步"),
    "轻快走": ("快走", "慢走", "步行"),
    "平地步行": ("快走", "慢走", "步行"),
    "低冲击有氧": ("低冲击", "有氧操", "固定自行车", "椭圆机"),
    "低冲击": ("低冲击", "有氧操", "固定自行车", "椭圆机"),
    "弹力带": ("弹力带",),
    "划船": ("划船",),
    "靠墙俯卧撑": ("墙壁俯卧撑", "桌边俯卧撑", "俯卧撑"),
    "俯卧撑": ("墙壁俯卧撑", "桌边俯卧撑", "俯卧撑"),
    "徒手": ("坐站", "靠墙", "提踵", "臀桥", "深蹲"),
    "坐站": ("坐站", "坐姿起立"),
    "徒手坐站": ("坐站", "坐姿起立"),
    "核心": ("核心", "死虫", "鸟狗", "骨盆"),
    "核心稳定": ("核心", "死虫", "鸟狗", "骨盆"),
    "柔韧": ("拉伸", "活动度", "猫牛", "旋转"),
    "拉伸": ("拉伸", "活动度", "猫牛", "旋转"),
    "活动度": ("活动度", "猫牛", "旋转"),
    "呼吸": ("呼吸", "缩唇", "调息"),
    "呼吸放松": ("呼吸", "缩唇", "调息"),
    "重心转移": ("重心转移",),
    "串联站": ("半脚前后站", "脚跟到脚尖", "接脚尖"),
    "扶持单腿站": ("单脚站立", "单腿站立"),
    "单腿": ("单脚站立", "单腿站立"),
    "太极": ("太极", "八段锦"),
    "八段锦": ("八段锦",),
    "提踵": ("提踵",),
    "小腿": ("提踵", "小腿"),
    "臀中肌": ("髋外展", "蚌式"),
    "股四头肌": ("股四头肌", "腿伸展", "直腿抬高"),
    "髋铰链": ("髋折叠", "髋铰链"),
    "轻哑铃": ("哑铃",),
}

GOAL_ALIASES = {
    "减脂": ("减脂", "体重管理", "超重肥胖", "脂肪"),
    "控糖": ("控糖", "血糖", "糖代谢", "胰岛素敏感性"),
    "控压": ("控压", "血压", "高血压"),
    "心肺耐力": ("心肺耐力", "心肺体能", "心肺提升", "有氧耐力", "低冲击心肺", "低强度心肺"),
    "肌力提升": ("肌力提升", "肌力维护", "肌力维持", "肌肉保留", "下肢力量", "力量"),
    "老年防跌倒": ("老年防跌倒", "防跌倒", "跌倒预防", "跌倒风险降低", "跌倒风险"),
    "久坐人群": ("久坐人群", "久坐减少", "打断久坐", "久坐低体能"),
}


def materialize_ai_generated_reference_bundle(
    *,
    docs_dir: str | Path,
    output_dir: str | Path,
    source_version: str = "ai-generated-formal-v1",
) -> dict[str, Any]:
    docs_path = Path(docs_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    contraindications = _load_items(output_path / CONTRAINDICATION_PARTIAL_FILE, ("items", "contraindications"))
    actions = [_normalize_action(item) for item in _load_items(docs_path / FORMAL_ACTIONS_FILE, ("items", "actions"))]
    actions = _dedupe_by(actions, "action_code")
    templates = [
        _normalize_template(item, actions=actions, source_version=source_version)
        for item in _load_items(docs_path / FORMAL_TEMPLATES_FILE, ("items", "templates"))
    ]
    risk_rules = [
        _normalize_risk_rule(item)
        for item in _load_items(docs_path / FORMAL_RISK_RULES_FILE, ("items", "rules", "risk_rules"))
    ]

    bundle = {
        "contraindications": contraindications,
        "actions": actions,
        "templates": templates,
        "risk_rules": risk_rules,
    }
    targets = GenerationTargets(
        contraindications=len(contraindications),
        actions=len(actions),
        templates=len(templates),
        risk_rules=len(risk_rules),
    )
    report = validate_reference_bundle(bundle, targets=targets)
    _write_json(output_path / "ai_generated_reference_validation_report.json", report)
    if report["blocking_errors"]:
        return report

    typed_bundle = ReferenceBundle.model_validate(bundle)
    dumped = {
        "contraindications": [item.model_dump(mode="json", exclude_none=True) for item in typed_bundle.contraindications],
        "actions": [item.model_dump(mode="json", exclude_none=True) for item in typed_bundle.actions],
        "templates": [item.model_dump(mode="json", exclude_none=False) for item in typed_bundle.templates],
        "risk_rules": [item.model_dump(mode="json", exclude_none=True) for item in typed_bundle.risk_rules],
    }
    _write_json(output_path / "ai_generated_contraindications.json", {"items": dumped["contraindications"]})
    _write_json(output_path / "ai_generated_exercise_actions.json", {"items": dumped["actions"]})
    _write_json(output_path / "ai_generated_prescription_templates.json", {"items": dumped["templates"]})
    _write_json(output_path / "ai_generated_risk_rules.json", {"items": dumped["risk_rules"]})
    _write_json(output_path / "ai_generated_reference_bundle.json", dumped)
    _write_json(
        output_path / "ai_generated_reference_manifest.json",
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generator": "scripts.materialize_ai_generated_reference_bundle",
            "runtime_provider": runtime_provider_summary(settings),
            "counts": report["counts"],
            "targets": asdict(targets),
            "coverage": report["coverage"],
            "schema_versions": _schema_versions(),
            "files": {
                "contraindications": "ai_generated_contraindications.json",
                "actions": "ai_generated_exercise_actions.json",
                "templates": "ai_generated_prescription_templates.json",
                "risk_rules": "ai_generated_risk_rules.json",
                "bundle": "ai_generated_reference_bundle.json",
                "validation_report": "ai_generated_reference_validation_report.json",
            },
            "source_inputs": {
                "contraindications": CONTRAINDICATION_PARTIAL_FILE,
                "actions": FORMAL_ACTIONS_FILE,
                "templates": FORMAL_TEMPLATES_FILE,
                "risk_rules": FORMAL_RISK_RULES_FILE,
            },
            "review_status": "AI_GENERATED_PENDING_EXPERT_REVIEW",
            "demo_or_mock": False,
            "safety_boundary": "R3 templates have no FITT-VP; R2 templates require expert review before publish.",
        },
    )
    return report


def _normalize_action(item: dict[str, Any]) -> dict[str, Any]:
    suitable_tags = _dedupe_strings(_string_list(item.get("suitable_tags")) or [_text(item.get("category"), "低冲击")])
    contraindication_tags = _dedupe_strings(_string_list(item.get("contraindication_tags")))
    suitable_tags = [tag for tag in suitable_tags if tag not in set(contraindication_tags)] or [_text(item.get("category"), "低冲击")]
    return {
        "action_code": _text(item.get("action_code"), item.get("name"), "ACT_UNKNOWN")[:96],
        "name": _text(item.get("name"), item.get("action_code"), "未命名动作")[:128],
        "category": _text(item.get("category"), item.get("exercise_type"), "低冲击")[:64],
        "risk_level": _risk_level(item.get("risk_level"), allowed=("R0", "R1", "R2"), default="R1"),
        "suitable_tags": suitable_tags,
        "contraindication_tags": contraindication_tags,
        "body_parts": _dedupe_strings(_string_list(item.get("body_parts")) or ["全身"]),
        "intensity": _text(item.get("intensity"), "低")[:32],
        "impact_level": _text(item.get("impact_level"), "低")[:32],
        "joint_stress_level": _text(item.get("joint_stress_level"), "低")[:32],
        "requires_equipment": bool(item.get("requires_equipment")) or bool(_text(item.get("equipment"), "")),
        "instructions": _text(item.get("instructions"), "保持自然呼吸，按RPE和症状监测执行。"),
        "stop_signals": _dedupe_strings(_string_list(item.get("stop_signals")) or STOP_SIGNALS),
        "evidence_refs": _dedupe_strings(_string_list(item.get("evidence_refs")) or _string_list(item.get("evidence_or_rationale")) or ["ACSM/WHO exercise guidance"]),
        "exercise_type": _text(item.get("exercise_type"), item.get("category"), None),
        "equipment": _text(item.get("equipment"), None),
        "difficulty": _text(item.get("difficulty"), None),
        "alternatives": _dedupe_strings(_string_list(item.get("alternatives"))),
        "common_mistakes": _dedupe_strings(_string_list(item.get("common_mistakes"))),
        "monitoring_tips": _dedupe_strings(_string_list(item.get("monitoring_tips"))),
        "source": "formal_ai_reference_library_materialized",
    }


def _normalize_template(item: dict[str, Any], *, actions: list[dict[str, Any]], source_version: str) -> dict[str, Any]:
    risk_level = _risk_level(item.get("risk_level"), allowed=("R0", "R1", "R2", "R3"), default="R1")
    raw_fitt = item.get("fitt_vp") if isinstance(item.get("fitt_vp"), dict) else {}
    fitt_vp = None
    if risk_level != "R3":
        fitt_vp = {
            "frequency": _text(raw_fitt.get("frequency"), "每周3次"),
            "intensity": _text(raw_fitt.get("intensity"), "低-中等强度，按RPE和症状调整"),
            "time": _text(raw_fitt.get("time"), "每次20-30分钟"),
            "type": _resolve_template_action_names(raw_fitt.get("type"), actions),
            "volume": _text(raw_fitt.get("volume"), "每周累计90-150分钟"),
            "progression": _text(raw_fitt.get("progression"), "每1-2周小幅增加总量，出现不适立即回退"),
        }
    return {
        "template_code": _text(item.get("template_code"), item.get("name"), "TPL_UNKNOWN")[:96],
        "name": _text(item.get("name"), item.get("template_code"), "未命名模板")[:128],
        "risk_level": risk_level,
        "cluster_tags": _dedupe_strings(_string_list(item.get("cluster_tags")) or ["一般成人"]),
        "goal_tags": _normalize_goal_tags(item.get("goal_tags")),
        "fitt_vp": fitt_vp,
        "precautions": _dedupe_strings(_string_list(item.get("precautions")) or ["按安全边界执行，出现停止信号立即停止。"]),
        "contraindications": _dedupe_strings(_string_list(item.get("contraindications"))),
        "evidence_refs": _dedupe_strings(_string_list(item.get("evidence_refs")) or ["ACSM/WHO exercise guidance"]),
        "status": "DRAFT",
        "review_status": _text(item.get("expert_review_status"), item.get("review_status"), "EXPERT_REVIEW_DRAFT"),
        "source_version": _text(item.get("version"), source_version),
    }


def _normalize_risk_rule(item: dict[str, Any]) -> dict[str, Any]:
    risk_level = _risk_level(item.get("risk_level"), allowed=("R0", "R1", "R2", "R3"), default="R1")
    return {
        "rule_code": _text(item.get("rule_code"), item.get("code"), item.get("rule_name"), "RULE_UNKNOWN")[:96],
        "rule_name": _text(item.get("rule_name"), item.get("rule_code"), "未命名规则")[:128],
        "risk_level": risk_level,
        "severity": _severity_for(risk_level, item.get("severity")),
        "priority": int(item.get("priority") or 100),
        "field_path": _text(item.get("field_path"), "risk_screening.unspecified"),
        "operator": _operator(item.get("operator")),
        "value": item.get("value"),
        "user_message": _text(item.get("user_message"), item.get("clinical_logic_cn"), "命中规则后进入对应风险流程。"),
        "contraindications": _dedupe_strings(_string_list(item.get("contraindications"))),
        "intensity_cap": _text(item.get("intensity_cap"), None),
        "evidence_source": _text(item.get("evidence_source"), item.get("clinical_logic_cn"), "专家规则表"),
        "review_status": _text(item.get("expert_review_status"), item.get("review_status"), "EXPERT_REVIEW_DRAFT"),
        "applies_to": _dedupe_strings(_string_list(item.get("applicable_scope"))),
    }


def _normalize_goal_tags(raw_value: Any) -> list[str]:
    tags = _dedupe_strings(_string_list(raw_value) or ["心肺耐力"])
    text = " ".join(tags)
    canonical = [goal for goal, aliases in GOAL_ALIASES.items() if any(alias in text for alias in aliases)]
    return _dedupe_strings([*tags, *canonical])


def _resolve_template_action_names(raw_value: Any, actions: list[dict[str, Any]]) -> list[str]:
    labels = _string_list(raw_value)
    resolved: list[str] = []
    for label in labels:
        match = _find_action_name(label, actions)
        if match:
            resolved.append(match)
    if not resolved:
        resolved = _default_action_suite(actions)
    return _dedupe_strings(resolved)[:8]


def _find_action_name(label: str, actions: list[dict[str, Any]]) -> str | None:
    names = [str(action["name"]) for action in actions]
    if label in names:
        return label
    compact_label = _compact(label)
    for name in names:
        compact_name = _compact(name)
        if compact_label == compact_name or compact_label in compact_name or compact_name in compact_label:
            return name
    keywords = []
    for key, values in ACTION_KEYWORDS.items():
        if key in label:
            keywords.extend(values)
    keywords.extend([token for token in (label.replace("/", " ").replace("和", " ").split()) if len(token) >= 2])
    for keyword in _dedupe_strings(keywords):
        for action in actions:
            haystack = " ".join(
                [
                    str(action.get("name") or ""),
                    str(action.get("category") or ""),
                    " ".join(_string_list(action.get("suitable_tags"))),
                    " ".join(_string_list(action.get("body_parts"))),
                ]
            )
            if keyword and keyword in haystack:
                return str(action["name"])
    return None


def _default_action_suite(actions: list[dict[str, Any]]) -> list[str]:
    preferred_categories = ("有氧", "抗阻", "柔韧", "平衡", "呼吸")
    selected: list[str] = []
    for category in preferred_categories:
        for action in actions:
            if category in str(action.get("category") or ""):
                selected.append(str(action["name"]))
                break
    return selected or [str(action["name"]) for action in actions[:3]]


def _load_items(path: Path, preferred_keys: tuple[str, ...]) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in preferred_keys:
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _risk_level(value: Any, *, allowed: tuple[str, ...], default: str) -> str:
    text = str(value or "")
    for level in ("R3", "R2", "R1", "R0"):
        if level in text:
            if level in allowed:
                return level
            if level == "R3" and "R2" in allowed:
                return "R2"
    return default


def _severity_for(risk_level: str, raw: Any) -> str:
    value = str(raw or "").strip().upper()
    if risk_level == "R3":
        return "RED"
    if risk_level == "R2":
        return "YELLOW"
    return value if value in {"GREEN", "YELLOW"} else "GREEN"


def _operator(raw: Any) -> str:
    value = str(raw or "").strip()
    supported = {"eq", "neq", "gt", "gte", "lt", "lte", "between", "in_any", "contains", "not_empty_restriction", "exists"}
    return value if value in supported else "exists"


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(value.strip())
    return result


def _dedupe_by(items: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        key = str(item.get(field) or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _compact(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum())


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    project_root = _default_project_root()
    parser = argparse.ArgumentParser(description="将 AI 正式草案资料库规范化为 split AI generated bundle。")
    parser.add_argument("--docs-dir", type=Path, default=project_root / "docs")
    parser.add_argument("--output-dir", type=Path, default=project_root / "docs" / "ai_generated")
    parser.add_argument("--source-version", default="ai-generated-formal-v1")
    parser.add_argument("--json", action="store_true")
    return parser


def _default_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2]


def main() -> int:
    args = build_arg_parser().parse_args()
    report = materialize_ai_generated_reference_bundle(
        docs_dir=args.docs_dir,
        output_dir=args.output_dir,
        source_version=args.source_version,
    )
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("AI generated reference materialization report:")
        print(f"- counts: {report['counts']}")
        if report["blocking_errors"]:
            print("- blocking_errors:")
            for error in report["blocking_errors"]:
                print(f"  - {error}")
    return 1 if report["blocking_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
