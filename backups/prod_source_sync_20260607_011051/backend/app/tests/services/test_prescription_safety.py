from app.services.prescription_safety_service import enforce_prescription_safety


def test_r3_no_training_plan():
    draft = {
        "risk_level": "R3",
        "fitt_vp": {
            "frequency": "每周3次",
            "intensity": "中等强度",
            "time": "每次30分钟",
            "type": ["快走"],
            "volume": "每周90分钟",
            "progression": "每2周增加10%",
        },
    }

    result = enforce_prescription_safety("R3", draft)

    assert result["risk_level"] == "R3"
    assert result["fitt_vp"] is None
    assert "医学评估" in result["safety_notice"]


def test_r2_removes_forbidden_actions_and_adds_condition_prompts():
    draft = {
        "risk_level": "R2",
        "cluster_label": "慢病稳定型",
        "goals": ["血压管理辅助"],
        "fitt_vp": {
            "frequency": "每周4次",
            "intensity": "高强度HIIT",
            "time": "每次45分钟",
            "type": ["HIIT冲刺", "大重量深蹲", "快走"],
            "volume": "每周180分钟",
            "progression": "每周增加冲刺和大重量抗阻",
        },
        "precautions": ["监测RPE"],
        "contraindications": [],
        "reassessment": "4周复评",
    }

    result = enforce_prescription_safety(
        "R2",
        draft,
        risk_contraindications=[
            "避免憋气和大负荷力量训练",
            "避免跳跃、长跑、深蹲大负荷和疼痛诱发动作",
            "避免空腹大强度运动",
        ],
        risk_snapshot={
            "risk_screening": {"has_hypertension": True, "has_diabetes": True, "medication": ["降糖药"]},
            "fitness_test": {"pain_score": 5},
        },
        template_fitt_vp={
            "frequency": "每周3次",
            "intensity": "低强度起步",
            "time": "每次20-30分钟",
            "type": ["快走", "八段锦"],
            "volume": "每周90分钟",
            "progression": "每2-4周根据反馈调整",
        },
    )

    assert result["fitt_vp"]["intensity"] == "低强度起步"
    assert result["fitt_vp"]["type"] == ["快走"]
    assert "HIIT冲刺" not in result["fitt_vp"]["type"]
    assert "大重量深蹲" not in result["fitt_vp"]["type"]
    assert "血糖监测" in "；".join(result["precautions"])
    assert "避免憋气" in "；".join(result["contraindications"])
