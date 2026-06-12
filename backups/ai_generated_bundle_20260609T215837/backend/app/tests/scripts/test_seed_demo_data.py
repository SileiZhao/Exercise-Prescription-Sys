from collections import Counter
from datetime import date, datetime, timedelta
import importlib

from sqlalchemy import func, select

from app.core.security import verify_password
from app.models.audit import AuditLog
from app.models.cluster import UserClusterAssignment
from app.models.enums import OrganizationType, UserRole
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
    UserProfileMeasurement,
)
from app.models.prescription import PrescriptionRecord, PrescriptionVersion
from app.models.research import ResearchExportRequest
from app.models.review import ExpertReview
from app.models.template import PrescriptionTemplate, TemplateStatus
from app.models.user import Organization, RefreshToken, User, UserConsent
from app.tests.helpers import create_test_user


DEMO_ORGANIZATION_NAME = "河南体育学院运动促进健康示范中心"
DEMO_PASSWORD = "test-demo-password"
DEMO_EMAILS = {
    "demo-user-r0@example.com": UserRole.USER,
    "demo-user-r1@example.com": UserRole.USER,
    "demo-user-r2@example.com": UserRole.USER,
    "demo-user-r3@example.com": UserRole.USER,
    "demo-expert@example.com": UserRole.EXPERT,
    "demo-admin@example.com": UserRole.ADMIN,
    "demo-researcher@example.com": UserRole.RESEARCHER,
}


def _load_seed_script(monkeypatch):
    monkeypatch.setenv("EPS_DEMO_PASSWORD", DEMO_PASSWORD)
    return importlib.import_module("scripts.seed_demo_data")


def _count(db_session, model) -> int:
    return db_session.scalar(select(func.count()).select_from(model))


def _count_for_user(db_session, model, user_id: int) -> int:
    return db_session.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))


def _demo_sample_users(db_session, organization_id: int) -> list[User]:
    return db_session.scalars(
        select(User)
        .where(User.organization_id == organization_id)
        .where(User.email.like("demo-sample-%@example.com"))
        .order_by(User.email)
    ).all()


def test_seed_demo_data_creates_demo_accounts_samples_and_is_idempotent(monkeypatch, db_session):
    seed_script = _load_seed_script(monkeypatch)

    first = seed_script.seed_demo_data(db_session, clear=True)

    organization = db_session.scalar(
        select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME)
    )
    assert organization is not None
    assert organization.type == OrganizationType.SCHOOL
    assert organization.contact_person == "演示数据管理员"
    assert first["organizations"]["created"] == 1

    for email, role in DEMO_EMAILS.items():
        user = db_session.scalar(select(User).where(User.email == email))
        assert user is not None, email
        assert user.role == role
        assert user.organization_id == organization.id
        assert user.full_name.startswith("[DEMO]")
        assert user.is_verified is True
        assert user.must_change_password is False
        assert verify_password(DEMO_PASSWORD, user.hashed_password)

    expected_login_risks = {
        "demo-user-r0@example.com": ("R0", "PUBLISHED", False),
        "demo-user-r1@example.com": ("R1", "PUBLISHED", False),
        "demo-user-r2@example.com": ("R2", "PENDING_REVIEW", True),
        "demo-user-r3@example.com": ("R3", "REFERRED", True),
    }
    for email, (risk_level, status, review_required) in expected_login_risks.items():
        user = db_session.scalar(select(User).where(User.email == email))
        assert user is not None, email
        profile = db_session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
        assert profile is not None, email
        assert "demo_seed" in profile.exercise_goal
        assert profile.occupation_type == "demo_login_account"
        assert db_session.scalar(select(FitnessTest).where(FitnessTest.user_id == user.id)) is not None
        assert db_session.scalar(select(BodyComposition).where(BodyComposition.user_id == user.id)) is not None
        assert db_session.scalar(select(BiochemicalIndex).where(BiochemicalIndex.user_id == user.id)) is not None
        for model in [UserProfileMeasurement, FitnessTest, BodyComposition, BiochemicalIndex]:
            assert _count_for_user(db_session, model, user.id) >= 2, f"{email} {model.__name__}"
        assignment = db_session.scalar(
            select(UserClusterAssignment).where(UserClusterAssignment.user_id == user.id)
        )
        assert assignment is not None, email
        assert f"demo_seed_{risk_level}" in assignment.rule_labels
        assert assignment.cluster_label in seed_script.DEMO_CLUSTER_LABELS.values()
        risk = db_session.scalar(select(RiskScreening).where(RiskScreening.user_id == user.id))
        assert risk is not None
        assert risk.risk_level == risk_level
        prescription = db_session.scalar(select(PrescriptionRecord).where(PrescriptionRecord.user_id == user.id))
        assert prescription is not None
        assert prescription.risk_level == risk_level
        assert prescription.status == status
        assert prescription.expert_review_required is review_required
        assert db_session.scalar(
            select(PrescriptionVersion).where(PrescriptionVersion.prescription_id == prescription.id)
        ) is not None
        feedback = db_session.scalar(select(ExerciseFeedback).where(ExerciseFeedback.user_id == user.id))
        assert feedback is not None
        assert 60 <= feedback.completion_rate <= 100
        assert date.today() - timedelta(days=6) <= feedback.exercise_date <= date.today()
        if risk_level == "R3":
            assert prescription.fitt_vp is None
            assert db_session.scalar(
                select(ExpertReview).where(ExpertReview.prescription_id == prescription.id)
            ).status == "REFERRED"
        else:
            assert prescription.fitt_vp is not None

    sample_users = _demo_sample_users(db_session, organization.id)
    assert len(sample_users) >= 40
    assert Counter(user.full_name.split()[1] for user in sample_users) == {
        "R0": 10,
        "R1": 10,
        "R2": 10,
        "R3": 10,
    }

    sample_ids = [user.id for user in sample_users]
    profile_by_user = {
        profile.user_id: profile
        for profile in db_session.scalars(
            select(UserProfile).where(UserProfile.user_id.in_(sample_ids))
        ).all()
    }
    assert set(profile_by_user) == set(sample_ids)
    assert all("demo_seed" in profile.exercise_goal for profile in profile_by_user.values())
    assert all(profile.occupation_type == "demo_sample" for profile in profile_by_user.values())
    for user in sample_users:
        for model in [UserProfileMeasurement, FitnessTest, BodyComposition, BiochemicalIndex]:
            assert _count_for_user(db_session, model, user.id) >= 2, f"{user.email} {model.__name__}"
        assignment = db_session.scalar(
            select(UserClusterAssignment).where(UserClusterAssignment.user_id == user.id)
        )
        assert assignment is not None, user.email
        assert assignment.cluster_label in seed_script.DEMO_CLUSTER_LABELS.values()
        assert any(label.startswith("demo_seed_") for label in assignment.rule_labels)

    for model in [
        FitnessTest,
        BodyComposition,
        BiochemicalIndex,
        RiskScreening,
        ExerciseFeedback,
        UserProfileMeasurement,
        PrescriptionRecord,
        PrescriptionVersion,
        UserClusterAssignment,
    ]:
        assert _count(db_session, model) >= 40, model.__name__

    prescriptions_by_risk = {
        risk_level: db_session.scalars(
            select(PrescriptionRecord).where(PrescriptionRecord.risk_level == risk_level)
        ).all()
        for risk_level in ["R0", "R1", "R2", "R3"]
    }
    assert all(row.status == "PUBLISHED" for row in prescriptions_by_risk["R0"])
    assert all(row.status == "PUBLISHED" for row in prescriptions_by_risk["R1"])
    assert {row.status for row in prescriptions_by_risk["R2"]} >= {"PENDING_REVIEW", "PUBLISHED"}
    assert all(row.status == "REFERRED" for row in prescriptions_by_risk["R3"])
    assert all(row.fitt_vp is None for row in prescriptions_by_risk["R3"])
    for risk_level, rows in prescriptions_by_risk.items():
        assert rows
        assert all(row.template_id is not None for row in rows), risk_level
        assert all(
            (row.llm_payload or {}).get("risk_rules", [{}])[0].get("code") == f"DEMO_{risk_level}_RULE"
            for row in rows
        )

    approved_demo_templates = {
        template.risk_level: template
        for template in db_session.scalars(
            select(PrescriptionTemplate)
            .where(PrescriptionTemplate.name.like("[DEMO] %"))
            .where(PrescriptionTemplate.status == TemplateStatus.APPROVED)
        ).all()
    }
    assert set(approved_demo_templates) == {"R0", "R1", "R2", "R3"}

    review_statuses = {
        row.status
        for row in db_session.scalars(
            select(ExpertReview).join(PrescriptionRecord, PrescriptionRecord.id == ExpertReview.prescription_id)
        )
    }
    assert {"PENDING", "APPROVED", "REJECTED", "NEEDS_INFO", "REFERRED"} <= review_statuses
    completed_demo_reviews = db_session.scalars(
        select(ExpertReview)
        .where(ExpertReview.reviewed_at.is_not(None))
        .join(PrescriptionRecord, PrescriptionRecord.id == ExpertReview.prescription_id)
        .where(PrescriptionRecord.llm_payload["source"].as_string() == "demo_seed")
    ).all()
    assert completed_demo_reviews
    assert all(review.created_at <= review.reviewed_at for review in completed_demo_reviews)

    demo_researcher_id = db_session.scalar(select(User.id).where(User.email == "demo-researcher@example.com"))
    export_statuses = {
        row.status
        for row in db_session.scalars(
            select(ResearchExportRequest).where(ResearchExportRequest.requested_by == demo_researcher_id)
        )
    }
    assert {"PENDING", "APPROVED", "REJECTED", "EXPIRED"} <= export_statuses

    counts_after_first = {
        model.__name__: _count(db_session, model)
        for model in [
            User,
            UserProfile,
            FitnessTest,
            BodyComposition,
            BiochemicalIndex,
            RiskScreening,
            ExerciseFeedback,
            UserProfileMeasurement,
            PrescriptionRecord,
            PrescriptionVersion,
            UserClusterAssignment,
            ExpertReview,
            ResearchExportRequest,
        ]
    }

    second = seed_script.seed_demo_data(db_session, clear=False)

    assert second["users"]["created"] == 0
    assert {
        model.__name__: _count(db_session, model)
        for model in [
            User,
            UserProfile,
            FitnessTest,
            BodyComposition,
            BiochemicalIndex,
            RiskScreening,
            ExerciseFeedback,
            UserProfileMeasurement,
            PrescriptionRecord,
            PrescriptionVersion,
            UserClusterAssignment,
            ExpertReview,
            ResearchExportRequest,
        ]
    } == counts_after_first


def test_seed_demo_data_backfills_template_bindings_for_existing_demo_prescriptions(monkeypatch, db_session):
    seed_script = _load_seed_script(monkeypatch)
    seed_script.seed_demo_data(db_session, clear=True)

    demo_prescriptions = db_session.scalars(
        select(PrescriptionRecord).where(PrescriptionRecord.llm_payload["source"].as_string() == "demo_seed")
    ).all()
    assert demo_prescriptions
    for prescription in demo_prescriptions:
        prescription.template_id = None
    db_session.commit()

    seed_script.seed_demo_data(db_session, clear=False)

    for prescription in db_session.scalars(
        select(PrescriptionRecord).where(PrescriptionRecord.llm_payload["source"].as_string() == "demo_seed")
    ):
        assert prescription.template_id is not None


def test_seed_demo_data_clear_removes_only_demo_data(monkeypatch, db_session):
    seed_script = _load_seed_script(monkeypatch)
    production_user = create_test_user(
        db_session,
        "real-user@example.com",
        UserRole.USER,
        full_name="真实用户",
    )
    production_id = production_user.id

    seed_script.seed_demo_data(db_session, clear=True)
    organization = db_session.scalar(
        select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME)
    )
    assert organization is not None
    assert _demo_sample_users(db_session, organization.id)
    demo_user = db_session.scalar(select(User).where(User.email == "demo-user-r2@example.com"))
    assert demo_user is not None
    db_session.add(
        AuditLog(
            actor_id=demo_user.id,
            action="USER_LOGIN",
            resource_type="users",
            resource_id=str(demo_user.id),
        )
    )
    db_session.add(
        RefreshToken(
            user_id=demo_user.id,
            token_hash="demo-refresh-token-hash",
            expires_at=datetime.utcnow() + timedelta(days=1),
        )
    )
    db_session.add(
        UserConsent(
            user_id=demo_user.id,
            consent_version="demo-v1",
            consent_text="demo consent",
        )
    )
    db_session.commit()

    removed = seed_script.clear_demo_data(db_session)

    assert removed["users"]["deleted"] >= 47
    assert removed["audit_logs"]["deleted"] >= 1
    assert removed["auth_tokens"]["deleted"] >= 1
    assert removed["consents"]["deleted"] >= 1
    assert db_session.get(User, production_id) is not None
    assert db_session.scalar(select(User).where(User.email == "real-user@example.com")) is not None
    assert db_session.scalar(select(User).where(User.email.like("demo-%@example.com"))) is None
    assert db_session.scalar(select(UserClusterAssignment)) is None
    assert db_session.scalar(
        select(Organization).where(Organization.name == DEMO_ORGANIZATION_NAME)
    ) is None


def test_seed_demo_data_main_supports_clear_flag(monkeypatch, capsys, db_session):
    seed_script = _load_seed_script(monkeypatch)
    monkeypatch.setattr(seed_script, "SessionLocal", lambda: db_session)
    monkeypatch.setattr("sys.argv", ["seed_demo_data.py", "--clear"])

    seed_script.main()

    output = capsys.readouterr().out
    assert "Seeded demo data:" in output
    assert "users_created=47" in output
    assert DEMO_PASSWORD not in output
    assert "Demo accounts are marked with [DEMO] names" in output
    assert db_session.scalar(select(User).where(User.email == "demo-admin@example.com")) is not None
