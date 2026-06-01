from app.models.template import PrescriptionTemplate, TemplateStatus
from app.services.template_service import TemplateMatchingService


def test_template_matching(db_session):
    template = PrescriptionTemplate(
        name="高血压谨慎型 FITT-VP 模板",
        risk_level="R2",
        cluster_tags=["肥胖代谢风险型", "心肺功能不足型"],
        goal_tags=["降血压", "增强心肺"],
        fitt_vp={
            "frequency": "每周3-5次",
            "intensity": "低强度起步，逐步过渡到中等强度",
            "time": "每次20-40分钟",
            "type": ["快走", "功率车", "八段锦"],
            "volume": "每周不少于90分钟",
            "progression": "每2-4周根据反馈小幅进阶",
        },
        precautions=["监测运动前后血压", "避免憋气和大负荷力量训练"],
        contraindications=["高强度间歇", "大重量抗阻"],
        status=TemplateStatus.APPROVED,
        version=1,
    )
    db_session.add(template)
    db_session.commit()

    result = TemplateMatchingService(db_session).match_template(
        risk_level="R2",
        cluster_labels=["肥胖代谢风险型"],
        goals=["降血压"],
    )

    assert result is not None
    assert result.name == "高血压谨慎型 FITT-VP 模板"
    assert result.fitt_vp["frequency"] == "每周3-5次"
    assert "大重量抗阻" in result.contraindications
