from copy import deepcopy
from typing import Any


def enforce_prescription_safety(risk_level: str, draft: dict[str, Any]) -> dict[str, Any]:
    """Apply non-negotiable post-generation safety rules to a prescription draft."""
    checked = deepcopy(draft)
    checked["risk_level"] = risk_level

    if risk_level == "R3":
        checked["fitt_vp"] = None
        checked["status"] = "REFERRED"
        checked["safety_notice"] = "当前存在高风险信号，系统不生成训练处方，建议先进行医学评估或专业转介。"
        checked["contraindications"] = ["禁止生成具体运动强度、训练动作、组数、时长和进阶计划"]
        return checked

    checked.setdefault("safety_notice", "处方已通过规则安全校验。")
    return checked
