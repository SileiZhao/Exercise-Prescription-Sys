import json
from pathlib import Path

from sqlalchemy import select

from app.models.template import ActionReviewStatus, ExerciseAction
from scripts.import_exercise_actions import import_exercise_actions


def write_payload(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_import_exercise_actions_creates_pending_review_actions(db_session, tmp_path):
    source = tmp_path / "actions.json"
    write_payload(
        source,
        json.dumps(
            [
                {
                    "action_code": "ACT_TRAD_001",
                    "source": "专家动作库",
                    "source_exercise_id": "BDJ-01",
                    "name": "八段锦",
                    "name_en": "Baduanjin",
                    "category": "传统功法",
                    "exercise_type": "traditional_qigong",
                    "image_url": "https://example.test/baduanjin.png",
                    "joint_stress_level": "低",
                    "impact_level": "低",
                    "requires_equipment": False,
                    "suitable_tags": ["老年功能下降型"],
                    "contraindication_tags": ["急性损伤"],
                    "risk_level": "R1",
                    "body_parts": ["全身"],
                    "equipment": "无",
                    "intensity": "低",
                    "instructions": "呼吸配合缓慢动作。",
                    "stop_signals": ["胸痛立即停止"],
                    "evidence_refs": ["WHO 2020"],
                },
                {
                    "name": "弹力带划船",
                    "category": "抗阻",
                    "suitable_tags": "肌力不足型,初级运动水平",
                    "contraindication_tags": "急性肩痛",
                    "risk_level": "R1",
                    "body_parts": "背部,肩",
                    "intensity": "低",
                },
            ],
            ensure_ascii=False,
        ),
    )

    result = import_exercise_actions(db_session, source)

    actions = db_session.scalars(select(ExerciseAction).order_by(ExerciseAction.name)).all()
    assert result == {"created": 2, "updated": 0, "approved": 0, "pending": 2}
    assert [action.name for action in actions] == ["八段锦", "弹力带划船"]
    assert all(action.status == ActionReviewStatus.PENDING_REVIEW for action in actions)
    assert actions[0].source == "专家动作库"
    assert actions[0].source_exercise_id == "BDJ-01"
    assert actions[0].name_en == "Baduanjin"
    assert actions[0].exercise_type == "traditional_qigong"
    assert actions[0].image_url == "https://example.test/baduanjin.png"
    assert actions[0].joint_stress_level == "低"
    assert actions[0].impact_level == "低"
    assert actions[0].requires_equipment is False
    assert actions[0].is_traditional_exercise is True
    assert actions[0].stop_signals == ["胸痛立即停止"]
    assert actions[0].evidence_refs == ["WHO 2020"]
    assert actions[1].suitable_tags == ["肌力不足型", "初级运动水平", "低冲击"]


def test_import_exercise_actions_can_mark_docs_library_approved(db_session, tmp_path):
    source = tmp_path / "actions.json"
    write_payload(
        source,
        json.dumps(
            [{"name": "快走", "category": "有氧", "risk_level": "R1"}],
            ensure_ascii=False,
        ),
    )

    import_exercise_actions(db_session, source, review_status=ActionReviewStatus.APPROVED)

    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "快走"))
    assert action.status == ActionReviewStatus.APPROVED
    assert action.reviewed_at is not None


def test_import_exercise_actions_derives_low_impact_and_contraindication_tags(db_session, tmp_path):
    source = tmp_path / "actions.json"
    write_payload(
        source,
        json.dumps(
            [
                {"name": "跳箱训练", "category": "爆发力", "risk_level": "R1", "suitable_tags": []},
                {"name": "固定自行车低阻力", "category": "有氧", "risk_level": "R1", "suitable_tags": []},
            ],
            ensure_ascii=False,
        ),
    )

    import_exercise_actions(db_session, source)

    jump = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "跳箱训练"))
    bike = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "固定自行车低阻力"))
    assert jump.impact_level == "高"
    assert "跳跃" in jump.contraindication_tags
    assert bike.impact_level == "低"
    assert bike.joint_stress_level == "低"
    assert "低冲击" in bike.suitable_tags


def test_import_exercise_actions_updates_existing_and_resets_review(db_session, tmp_path):
    existing = ExerciseAction(
        name="八段锦",
        category="传统功法",
        suitable_tags=["旧标签"],
        risk_level="R0",
        intensity="中",
        status=ActionReviewStatus.APPROVED,
    )
    db_session.add(existing)
    db_session.commit()
    source = tmp_path / "actions.json"
    write_payload(
        source,
        json.dumps(
            [
                {
                    "name": "八段锦",
                    "category": "传统功法",
                    "suitable_tags": ["慢病", "低冲击"],
                    "contraindication_tags": ["严重气短"],
                    "risk_level": "R1",
                    "body_parts": ["全身"],
                    "intensity": "低",
                    "instructions": "更新后的动作说明。",
                }
            ],
            ensure_ascii=False,
        ),
    )

    result = import_exercise_actions(db_session, source)

    actions = db_session.scalars(select(ExerciseAction)).all()
    assert result == {"created": 0, "updated": 1, "approved": 0, "pending": 1}
    assert len(actions) == 1
    assert actions[0].suitable_tags == ["慢病", "低冲击"]
    assert actions[0].status == ActionReviewStatus.PENDING_REVIEW
    assert actions[0].reviewed_by is None
    assert actions[0].reviewed_at is None


def test_import_exercise_actions_approves_existing_pending_formal_row(db_session, tmp_path):
    existing = ExerciseAction(
        name="八段锦",
        category="传统功法",
        suitable_tags=["历史待审"],
        risk_level="R1",
        intensity="低",
        status=ActionReviewStatus.PENDING_REVIEW,
        source="backend/data/seed_actions.json",
    )
    db_session.add(existing)
    db_session.commit()

    source = tmp_path / "actions.json"
    write_payload(
        source,
        json.dumps(
            [
                {
                    "name": "八段锦",
                    "category": "传统功法",
                    "suitable_tags": ["老年友好", "低冲击"],
                    "contraindication_tags": ["急性损伤"],
                    "risk_level": "R1",
                    "body_parts": ["全身"],
                    "intensity": "低",
                    "instructions": "正式库动作说明。",
                }
            ],
            ensure_ascii=False,
        ),
    )

    result = import_exercise_actions(db_session, source, review_status=ActionReviewStatus.APPROVED)

    row = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "八段锦"))
    assert result == {"created": 0, "updated": 1, "approved": 1, "pending": 0}
    assert row.status == ActionReviewStatus.APPROVED
    assert row.reviewed_at is not None
    assert row.suitable_tags == ["老年友好", "低冲击"]
    assert row.source == "docs/ai_exercise_action_library_v0_1_expert_review_draft.json"

