from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus
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


def test_template_matching_scores_cluster_and_goals_within_risk_level(db_session):
    low_score = PrescriptionTemplate(
        name="R2 通用谨慎模板",
        risk_level="R2",
        cluster_tags=[],
        goal_tags=[],
        fitt_vp={"frequency": "3天", "intensity": "低", "time": "20分钟", "type": ["快走"], "volume": "60分钟", "progression": "缓慢"},
        precautions=[],
        contraindications=[],
        status=TemplateStatus.APPROVED,
        version=9,
    )
    high_score = PrescriptionTemplate(
        name="R2 高血压减脂模板",
        risk_level="R2",
        cluster_tags=["肥胖代谢风险型"],
        goal_tags=["降血压"],
        fitt_vp={"frequency": "5天", "intensity": "低", "time": "30分钟", "type": ["功率车"], "volume": "150分钟", "progression": "缓慢"},
        precautions=[],
        contraindications=[],
        status=TemplateStatus.APPROVED,
        version=1,
    )
    db_session.add_all([low_score, high_score])
    db_session.commit()

    result = TemplateMatchingService(db_session).match_template(
        risk_level="R2",
        cluster_labels=["肥胖代谢风险型"],
        goals=["降血压"],
    )

    assert result.name == "R2 高血压减脂模板"


def test_template_matching_does_not_return_r3_safety_template(db_session):
    db_session.add(
        PrescriptionTemplate(
            name="R3 安全提醒",
            risk_level="R3",
            cluster_tags=["红色风险"],
            goal_tags=["医学转介"],
            fitt_vp=None,
            precautions=["不生成训练处方"],
            contraindications=["训练处方"],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    db_session.commit()

    result = TemplateMatchingService(db_session).match_template(
        risk_level="R3",
        cluster_labels=["红色风险"],
        goals=["医学转介"],
    )

    assert result is None


def test_template_matching_candidate_actions_only_use_approved_low_impact_actions(db_session):
    approved = ExerciseAction(
        name="快走",
        category="有氧",
        risk_level="R1",
        impact_level="低",
        joint_stress_level="低",
        suitable_tags=["减脂", "低冲击"],
        contraindication_tags=[],
        intensity="低",
        status=ActionReviewStatus.APPROVED,
    )
    pending = ExerciseAction(
        name="跳箱训练",
        category="爆发力",
        risk_level="R1",
        impact_level="高",
        joint_stress_level="高",
        suitable_tags=["减脂"],
        contraindication_tags=["跳跃"],
        intensity="高",
        status=ActionReviewStatus.PENDING_REVIEW,
    )
    db_session.add_all([approved, pending])
    db_session.commit()

    candidates = TemplateMatchingService(db_session).candidate_actions(
        risk_level="R1",
        cluster_labels=[],
        goals=["减脂"],
    )

    assert [item["name"] for item in candidates] == ["快走"]
    assert candidates[0]["impact_level"] == "低"



def test_template_matching_candidate_actions_exclude_risk_contraindication_conflicts(db_session):
    safe = ExerciseAction(
        name="固定自行车低阻力",
        category="有氧",
        risk_level="R2",
        impact_level="低",
        joint_stress_level="低",
        suitable_tags=["减脂", "低冲击"],
        contraindication_tags=[],
        intensity="低",
        status=ActionReviewStatus.APPROVED,
    )
    unsafe = ExerciseAction(
        name="负重憋气深蹲",
        category="抗阻",
        risk_level="R2",
        impact_level="高",
        joint_stress_level="高",
        suitable_tags=["减脂"],
        contraindication_tags=["憋气", "大重量"],
        intensity="高",
        status=ActionReviewStatus.APPROVED,
    )
    db_session.add_all([safe, unsafe])
    db_session.commit()

    candidates = TemplateMatchingService(db_session).candidate_actions(
        risk_level="R2",
        cluster_labels=[],
        goals=["减脂"],
        risk_contraindications=["避免憋气和大负荷力量训练"],
    )

    assert [item["name"] for item in candidates] == ["固定自行车低阻力"]


def test_template_matching_candidate_actions_exclude_reference_forbidden_categories(db_session):
    safe = ExerciseAction(
        name="椅上呼吸训练",
        category="呼吸训练",
        risk_level="R2",
        impact_level="低",
        joint_stress_level="低",
        suitable_tags=["降血压"],
        contraindication_tags=[],
        intensity="低",
        status=ActionReviewStatus.APPROVED,
    )
    resistance = ExerciseAction(
        name="弹力带划船",
        category="抗阻",
        risk_level="R2",
        impact_level="低",
        joint_stress_level="低",
        suitable_tags=["降血压"],
        contraindication_tags=[],
        intensity="中",
        status=ActionReviewStatus.APPROVED,
    )
    equipment = ExerciseAction(
        name="椭圆机训练",
        category="有氧",
        risk_level="R2",
        impact_level="低",
        joint_stress_level="低",
        requires_equipment=True,
        equipment="椭圆机",
        suitable_tags=["降血压"],
        contraindication_tags=[],
        intensity="中",
        status=ActionReviewStatus.APPROVED,
    )
    db_session.add_all([safe, resistance, equipment])
    db_session.commit()

    candidates = TemplateMatchingService(db_session).candidate_actions(
        risk_level="R2",
        cluster_labels=[],
        goals=["降血压"],
        forbidden_action_categories=["抗阻", "器械"],
    )

    assert [item["name"] for item in candidates] == ["椅上呼吸训练"]





def test_contraindication_reference_service_matches_hypertension_forbidden_categories(monkeypatch, tmp_path):
    docs_dir = tmp_path / "docs" / "ai_generated"
    docs_dir.mkdir(parents=True)
    (docs_dir / "ai_generated_contraindications.partial.json").write_text(
        """{"items":[{"contraindication_code":"CI_HYP_UNC_001","disease":"未控制的高血压","risk_level":"R2","contraindication_type":"relative","forbidden_action_categories":["抗阻","高强度有氧","器械"],"stop_signals":["胸痛"],"referral_criteria":["血压持续>180/110mmHg需转介心内科"],"rationale":"高血压需限制抗阻和器械训练"}]}""",
        encoding="utf-8",
    )
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

    from app.services.contraindication_reference_service import ContraindicationReferenceService

    result = ContraindicationReferenceService().match(
        risk_level="R2",
        risk_contraindications=["避免憋气和大负荷力量训练"],
        risk_snapshot={"risk_screening": {"has_hypertension": True}},
        matched_rule_codes=["YELLOW_HYPERTENSION"],
        goals=["降血压"],
    )

    assert result["matched_codes"] == ["CI_HYP_UNC_001"]
    assert result["forbidden_action_categories"] == ["抗阻", "高强度有氧", "器械"]
    assert result["stop_signals"] == ["胸痛"]
    assert result["referral_criteria"] == ["血压持续>180/110mmHg需转介心内科"]
