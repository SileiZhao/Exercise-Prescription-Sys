import pytest
from pydantic import ValidationError

from app.schemas.prescription import PrescriptionDraft


def test_llm_output_schema():
    draft = PrescriptionDraft.model_validate(
        {
            "risk_level": "R1",
            "cluster_label": "肥胖代谢风险型",
            "goals": ["减脂", "增强心肺"],
            "fitt_vp": {
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走", "弹力带抗阻"],
                "volume": "每周120分钟",
                "progression": "每2周增加5-10分钟",
            },
            "precautions": ["运动中出现胸闷头晕应停止并评估"],
            "contraindications": ["高强度冲刺"],
            "reassessment": "4周小评估，12周阶段评估",
        }
    )

    assert draft.fitt_vp.frequency == "每周4次"

    with pytest.raises(ValidationError):
        PrescriptionDraft.model_validate(
            {
                "risk_level": "R1",
                "cluster_label": "肥胖代谢风险型",
                "goals": ["减脂"],
                "precautions": [],
                "contraindications": [],
                "reassessment": "4周复测",
            }
        )
