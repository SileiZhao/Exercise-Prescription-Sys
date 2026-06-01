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
