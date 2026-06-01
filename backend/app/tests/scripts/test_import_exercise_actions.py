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
                    "name": "八段锦",
                    "category": "传统功法",
                    "suitable_tags": ["老年功能下降型"],
                    "contraindication_tags": ["急性损伤"],
                    "risk_level": "R1",
                    "body_parts": ["全身"],
                    "intensity": "低",
                    "instructions": "呼吸配合缓慢动作。",
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
    assert result == {"created": 2, "updated": 0}
    assert [action.name for action in actions] == ["八段锦", "弹力带划船"]
    assert all(action.status == ActionReviewStatus.PENDING_REVIEW for action in actions)
    assert actions[1].suitable_tags == ["肌力不足型", "初级运动水平"]


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
    assert result == {"created": 0, "updated": 1}
    assert len(actions) == 1
    assert actions[0].suitable_tags == ["慢病", "低冲击"]
    assert actions[0].status == ActionReviewStatus.PENDING_REVIEW
    assert actions[0].reviewed_by is None
    assert actions[0].reviewed_at is None
