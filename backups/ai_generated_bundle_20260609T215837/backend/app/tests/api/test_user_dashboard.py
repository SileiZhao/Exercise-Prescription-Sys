from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
)
from app.models.prescription import PrescriptionRecord
from app.models.user import User


def login(client: TestClient, email: str) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": email,
            "role": "USER",
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": "StrongPass123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def user_id(db_session, email: str) -> int:
    return db_session.scalar(select(User.id).where(User.email == email))


def test_user_dashboard_summarizes_current_plan_and_feedback(client: TestClient, db_session):
    headers = login(client, "dashboard-user@example.com")
    uid = user_id(db_session, "dashboard-user@example.com")
    today = date.today()
    db_session.add_all(
        [
            UserProfile(
                user_id=uid,
                name="运动用户",
                sex="女",
                birth_date=date(1986, 1, 1),
                age=40,
                height_cm=165,
                weight_kg=72,
                bmi=26.4,
                waist_cm=86,
                hip_cm=98,
                whr=0.88,
                exercise_goal=["体重管理", "改善血压"],
                exercise_habit="偶尔",
                exercise_experience="初级",
            ),
            FitnessTest(
                user_id=uid,
                resting_hr=78,
                sbp=146,
                dbp=92,
                vital_capacity=3200,
                grip_left=28,
                grip_right=30,
                sit_reach=12,
                single_leg_stand=26,
                pain_score=2,
            ),
            BodyComposition(
                user_id=uid,
                body_fat_pct=31.5,
                skeletal_muscle_kg=25.4,
                visceral_fat_level=10,
            ),
            BiochemicalIndex(
                user_id=uid,
                fbg=5.6,
                hba1c=5.7,
                tg=1.8,
                hdl_c=1.1,
                ldl_c=3.1,
            ),
            RiskScreening(
                user_id=uid,
                has_hypertension=True,
                has_diabetes=False,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=False,
                has_joint_pain=True,
                recent_injury=False,
                medication=["降压药"],
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=False,
                palpitation=False,
                risk_level="R2",
                risk_reasons=["血压偏高，需专家审核后执行"],
            ),
        ]
    )
    db_session.flush()
    prescription = PrescriptionRecord(
        user_id=uid,
        risk_level="R2",
        cluster_label="血压关注 + 体重管理",
        goals=["体重管理", "改善血压"],
        fitt_vp={
            "frequency": "每周4次",
            "intensity": "低-中强度",
            "time": "每次30分钟",
            "type": ["快走", "拉伸"],
            "volume": "每周120分钟",
            "progression": "2周后依据RPE进阶",
        },
        precautions=["运动前监测血压"],
        contraindications=["憋气用力"],
        reassessment="4周复评",
        evidence_refs=[],
        llm_payload={
            "risk_rules": [
                {
                    "code": "YELLOW_HYPERTENSION",
                    "severity": "YELLOW",
                    "message": "血压偏高，需专家审核后执行",
                    "path": "risk_screening.has_hypertension",
                    "value": True,
                    "threshold": "既往高血压或当前血压 >= 140/90",
                }
            ]
        },
        safety_notice="R2 已审核发布，可按低强度起步。",
        status="PUBLISHED",
        expert_review_required=True,
        version=3,
    )
    db_session.add(prescription)
    db_session.flush()
    db_session.add_all(
        [
            ExerciseFeedback(
                user_id=uid,
                prescription_id=prescription.id,
                exercise_date=today - timedelta(days=1),
                exercise_type="快走",
                frequency_week=1,
                duration_min=25,
                intensity_level="低",
                rpe=6,
                completion_rate=80,
                discomfort=[],
                pain_score_after=1,
            ),
            ExerciseFeedback(
                user_id=uid,
                prescription_id=prescription.id,
                exercise_date=today - timedelta(days=2),
                exercise_type="拉伸",
                frequency_week=2,
                duration_min=20,
                intensity_level="低",
                rpe=17,
                completion_rate=50,
                discomfort=["头晕"],
                pain_score_after=4,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/v1/user/dashboard", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["current_risk_level"] == "R2"
    assert body["profile_completion_rate"] == 100
    assert body["expert_review_status"] == "PUBLISHED"
    assert body["today_can_exercise"] is True
    assert body["weekly_completion_rate"] == 65
    assert body["current_stage_goals"] == ["体重管理", "改善血压"]
    assert body["recent_feedback"]["rpe"] == 6
    assert body["recent_feedback"]["pain_score_after"] == 1
    assert body["monitoring_reminders"] == ["血压监测提醒", "血糖监测提醒"]
    assert body["prescription_version"] == 3
    assert body["next_reassessment_date"] is not None
    assert body["streak_days"] == 2
    assert body["weekly_target_hits"] == 2
    assert body["abnormal_feedback_count"] == 1
    assert body["plan_completion_trend"] == [50, 80]
    assert body["feedback_trend"] == [
        {
            "date": (today - timedelta(days=2)).isoformat(),
            "rpe": 17.0,
            "pain": 4,
            "completion_rate": 50.0,
        },
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "rpe": 6.0,
            "pain": 1,
            "completion_rate": 80.0,
        },
    ]
    assert {"metric": "BMI", "value": 26.4, "max": 40} in body["health_radar"]
    assert {"metric": "收缩压", "value": 146, "max": 180} in body["health_radar"]
    assert {"metric": "体脂率", "value": 31.5, "max": 45} in body["health_radar"]
    assert {"metric": "空腹血糖", "value": 5.6, "max": 16.7} in body["health_radar"]
    assert body["risk_rule_hits"] == [
        {
            "rule_id": "YELLOW_HYPERTENSION",
            "rule_name": "YELLOW_HYPERTENSION",
            "field_path": "risk_screening.has_hypertension",
            "hit_value": True,
            "threshold": "既往高血压或当前血压 >= 140/90",
            "action_label": "提交专家审核",
            "risk_level": "R2",
            "explanation": "血压偏高，需专家审核后执行",
        }
    ]



def test_user_dashboard_derives_rule_hits_from_risk_reasons_when_payload_missing(client: TestClient, db_session):
    headers = login(client, "dashboard-risk-reasons@example.com")
    uid = user_id(db_session, "dashboard-risk-reasons@example.com")
    db_session.add(
        RiskScreening(
            user_id=uid,
            has_hypertension=True,
            has_diabetes=False,
            has_chd=False,
            has_stroke=False,
            has_ckd=False,
            has_respiratory_disease=False,
            has_joint_pain=False,
            recent_injury=False,
            medication=[],
            chest_pain=False,
            syncope=False,
            abnormal_dyspnea=False,
            palpitation=False,
            risk_level="R2",
            risk_reasons=["血压偏高，需专家审核后执行"],
        )
    )
    db_session.commit()

    response = client.get("/api/v1/user/dashboard", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["risk_rule_hits"] == [
        {
            "rule_id": "RISK_REASON_1",
            "rule_name": "风险规则命中",
            "field_path": None,
            "hit_value": None,
            "threshold": None,
            "action_label": "提交专家审核",
            "risk_level": "R2",
            "explanation": "血压偏高，需专家审核后执行",
        }
    ]



def test_user_dashboard_reports_partial_six_category_completion(client: TestClient, db_session):
    headers = login(client, "dashboard-partial-profile@example.com")
    uid = user_id(db_session, "dashboard-partial-profile@example.com")
    db_session.add_all(
        [
            UserProfile(
                user_id=uid,
                name="部分建档用户",
                sex="男",
                birth_date=date(1990, 1, 1),
                age=36,
                height_cm=172,
                weight_kg=75,
                bmi=25.4,
                waist_cm=84,
                hip_cm=96,
                whr=0.88,
                exercise_goal=["体质提升"],
                exercise_habit="偶尔",
                exercise_experience="初级",
            ),
            FitnessTest(user_id=uid, resting_hr=76, sbp=128, dbp=82, pain_score=1),
            BodyComposition(user_id=uid, body_fat_pct=24.5, skeletal_muscle_kg=28, visceral_fat_level=8),
            BiochemicalIndex(user_id=uid, fbg=5.2, hba1c=5.4, tg=1.2, hdl_c=1.3, ldl_c=2.8),
            RiskScreening(
                user_id=uid,
                has_hypertension=False,
                has_diabetes=False,
                has_chd=False,
                has_stroke=False,
                has_ckd=False,
                has_respiratory_disease=False,
                has_joint_pain=False,
                recent_injury=False,
                medication=[],
                chest_pain=False,
                syncope=False,
                abnormal_dyspnea=False,
                palpitation=False,
                risk_level="R1",
                risk_reasons=["基础风险较低"],
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/v1/user/dashboard", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["profile_completion_rate"] == 83.33
