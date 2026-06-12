from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import resolve_project_root

CONTRAINDICATION_FILES = (
    "docs/ai_generated/ai_generated_contraindications.json",
    "docs/ai_generated/ai_generated_contraindications.partial.json",
    "docs/ai_generated_contraindications.json",
    "docs/ai_generated_contraindications.partial.json",
)

RULE_KEYWORDS = {
    "YELLOW_HYPERTENSION": ("高血压", "血压", "陂血压"),
    "YELLOW_HIGH_BLOOD_PRESSURE": ("高血压", "血压", "陂血压"),
    "RED_SEVERE_BLOOD_PRESSURE": ("高血压", "血压", "陂血压"),
    "RED_SEVERE_DIASTOLIC_PRESSURE": ("高血压", "血压", "陂血压"),
    "YELLOW_DIABETES": ("糖尿病", "血糖", "控糖", "降糖"),
    "YELLOW_PAIN_4_6": ("疼痛", "关节", "损伤"),
    "RED_SEVERE_PAIN": ("疼痛", "关节", "损伤"),
    "RED_CHEST_PAIN": ("胸痛", "心绞痛", "冠心病", "心血管"),
    "RED_SYNCOPE": ("晕厥", "黑蒙", "头晕"),
    "RED_DYSPNEA": ("气短", "呼吸困难", "肺", "哮喘"),
    "RED_RECENT_INJURY": ("损伤", "骨折", "疼痛"),
}

SNAPSHOT_KEYWORDS = {
    "has_hypertension": ("高血压", "血压", "陂血压"),
    "has_diabetes": ("糖尿病", "血糖", "控糖", "降糖"),
    "chest_pain": ("胸痛", "心绞痛", "冠心病", "心血管"),
    "syncope": ("晕厥", "黑蒙", "头晕"),
    "abnormal_dyspnea": ("气短", "呼吸困难", "肺", "哮喘"),
    "recent_injury": ("损伤", "骨折", "疼痛"),
}


def _items_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "contraindications"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _clean_strings(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value).strip()
        if text and text not in seen:
            seen.add(text)
            cleaned.append(text)
    return cleaned


def _normalise(values: list[str]) -> str:
    return " ".join(value.strip().lower() for value in values if value and value.strip())


@lru_cache(maxsize=8)
def _load_items(project_root: str) -> tuple[dict[str, Any], ...]:
    root = Path(project_root)
    for relative in CONTRAINDICATION_FILES:
        path = root / relative
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        return tuple(_items_from_payload(payload))
    return ()


class ContraindicationReferenceService:
    def __init__(self, project_root: Path | None = None):
        self.project_root = project_root or resolve_project_root()

    def match(
        self,
        *,
        risk_level: str,
        risk_contraindications: list[str] | None = None,
        risk_snapshot: dict[str, Any] | None = None,
        matched_rule_codes: list[str] | None = None,
        goals: list[str] | None = None,
    ) -> dict[str, list[str]]:
        keywords = self._context_keywords(
            risk_contraindications=risk_contraindications or [],
            risk_snapshot=risk_snapshot or {},
            matched_rule_codes=matched_rule_codes or [],
            goals=goals or [],
        )
        keyword_text = _normalise(keywords)
        matched: list[dict[str, Any]] = []
        for item in _load_items(str(self.project_root)):
            item_risk = str(item.get("risk_level") or "").strip()
            if item_risk and item_risk != risk_level:
                continue
            item_text = self._item_text(item)
            if keyword_text and any(keyword in item_text for keyword in keywords):
                matched.append(item)

        return {
            "matched_codes": self._unique_from_items(matched, "contraindication_code"),
            "forbidden_action_categories": self._unique_list(
                category
                for item in matched
                for category in _clean_strings(item.get("forbidden_action_categories"))
            ),
            "stop_signals": self._unique_list(
                signal for item in matched for signal in _clean_strings(item.get("stop_signals"))
            ),
            "referral_criteria": self._unique_list(
                criterion for item in matched for criterion in _clean_strings(item.get("referral_criteria"))
            ),
        }

    def _context_keywords(
        self,
        *,
        risk_contraindications: list[str],
        risk_snapshot: dict[str, Any],
        matched_rule_codes: list[str],
        goals: list[str],
    ) -> list[str]:
        keywords: list[str] = []
        keywords.extend(_clean_strings(risk_contraindications))
        keywords.extend(_clean_strings(goals))
        for code in matched_rule_codes:
            keywords.extend(RULE_KEYWORDS.get(str(code), ()))
        screening = risk_snapshot.get("risk_screening") or {}
        for field, field_keywords in SNAPSHOT_KEYWORDS.items():
            if screening.get(field):
                keywords.extend(field_keywords)
        fitness = risk_snapshot.get("fitness_test") or {}
        if (fitness.get("sbp") or 0) >= 140 or (fitness.get("dbp") or 0) >= 90:
            keywords.extend(("高血压", "血压", "陂血压"))
        if (fitness.get("pain_score") or 0) >= 4:
            keywords.extend(("疼痛", "关节", "损伤"))
        return self._unique_list(keywords)

    def _item_text(self, item: dict[str, Any]) -> str:
        values = [
            item.get("contraindication_code"),
            item.get("disease"),
            item.get("rationale"),
            *(_clean_strings(item.get("forbidden_action_categories"))),
            *(_clean_strings(item.get("stop_signals"))),
            *(_clean_strings(item.get("referral_criteria"))),
        ]
        return _normalise([str(value) for value in values if value])

    def _unique_from_items(self, items: list[dict[str, Any]], key: str) -> list[str]:
        return self._unique_list(str(item.get(key) or "").strip() for item in items)

    def _unique_list(self, values) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = str(value).strip()
            if text and text not in seen:
                seen.add(text)
                result.append(text)
        return result
