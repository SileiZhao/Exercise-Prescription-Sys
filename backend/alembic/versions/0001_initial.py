"""initial auth schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    organization_type = postgresql.ENUM(
        "SCHOOL", "COMMUNITY", "HOSPITAL", "GYM", "ENTERPRISE", "OTHER",
        name="organizationtype",
        create_type=False,
    )
    user_role = postgresql.ENUM(
        "USER", "EXPERT", "ADMIN", "RESEARCHER", "ORG_ADMIN",
        name="userrole",
        create_type=False,
    )
    organization_type.create(op.get_bind(), checkfirst=True)
    user_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("type", organization_type, nullable=False),
        sa.Column("contact_person", sa.String(length=64), nullable=True),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
        sa.UniqueConstraint("name", name=op.f("uq_organizations_name")),
    )
    op.create_index(op.f("ix_organizations_name"), "organizations", ["name"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=64), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_users_organization_id_organizations"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("phone", name=op.f("uq_users_phone")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_index(op.f("ix_users_organization_id"), "users", ["organization_id"], unique=False)
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=False)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], name=op.f("fk_audit_logs_actor_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)
    op.create_index(
        op.f("ix_audit_logs_resource_type"), "audit_logs", ["resource_type"], unique=False
    )

    op.create_table(
        "expert_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=64), nullable=True),
        sa.Column("specialty", sa.String(length=128), nullable=True),
        sa.Column("certificate_no", sa.String(length=128), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("review_capacity_per_day", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_expert_profiles_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expert_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_expert_profiles_user_id")),
    )
    op.create_index(op.f("ix_expert_profiles_user_id"), "expert_profiles", ["user_id"], unique=False)

    op.create_table(
        "user_profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("bmi", sa.Float(), nullable=False),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("hip_cm", sa.Float(), nullable=True),
        sa.Column("whr", sa.Float(), nullable=True),
        sa.Column("occupation_type", sa.String(length=64), nullable=True),
        sa.Column("sedentary_hours", sa.Float(), nullable=True),
        sa.Column("sleep_hours", sa.Float(), nullable=True),
        sa.Column("exercise_goal", sa.JSON(), nullable=False),
        sa.Column("exercise_habit", sa.String(length=64), nullable=False),
        sa.Column("exercise_experience", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_profile_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_profile")),
        sa.UniqueConstraint("user_id", name=op.f("uq_user_profile_user_id")),
    )
    op.create_index(op.f("ix_user_profile_user_id"), "user_profile", ["user_id"], unique=False)

    op.create_table(
        "fitness_test",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("resting_hr", sa.Integer(), nullable=False),
        sa.Column("sbp", sa.Integer(), nullable=False),
        sa.Column("dbp", sa.Integer(), nullable=False),
        sa.Column("vital_capacity", sa.Integer(), nullable=True),
        sa.Column("grip_left", sa.Float(), nullable=True),
        sa.Column("grip_right", sa.Float(), nullable=True),
        sa.Column("sit_reach", sa.Float(), nullable=True),
        sa.Column("vertical_jump", sa.Float(), nullable=True),
        sa.Column("push_up", sa.Integer(), nullable=True),
        sa.Column("sit_up", sa.Integer(), nullable=True),
        sa.Column("single_leg_stand", sa.Float(), nullable=True),
        sa.Column("reaction_time", sa.Float(), nullable=True),
        sa.Column("step_test_index", sa.Float(), nullable=True),
        sa.Column("six_mwt", sa.Float(), nullable=True),
        sa.Column("pain_score", sa.Integer(), nullable=False),
        sa.Column("rpe_baseline", sa.Float(), nullable=True),
        sa.Column("measured_at", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_fitness_test_created_by_users")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_fitness_test_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fitness_test")),
    )
    op.create_index(op.f("ix_fitness_test_measured_at"), "fitness_test", ["measured_at"], unique=False)
    op.create_index(op.f("ix_fitness_test_user_id"), "fitness_test", ["user_id"], unique=False)

    op.create_table(
        "body_composition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("body_fat_pct", sa.Float(), nullable=True),
        sa.Column("skeletal_muscle_kg", sa.Float(), nullable=True),
        sa.Column("muscle_mass_kg", sa.Float(), nullable=True),
        sa.Column("fat_free_mass", sa.Float(), nullable=True),
        sa.Column("visceral_fat_level", sa.Float(), nullable=True),
        sa.Column("bmr", sa.Float(), nullable=True),
        sa.Column("body_water_pct", sa.Float(), nullable=True),
        sa.Column("bone_mass_kg", sa.Float(), nullable=True),
        sa.Column("protein_pct", sa.Float(), nullable=True),
        sa.Column("body_type", sa.String(length=64), nullable=True),
        sa.Column("device_model", sa.String(length=128), nullable=True),
        sa.Column("measured_at", sa.DateTime(), nullable=False),
        sa.Column("is_fasting", sa.Boolean(), nullable=True),
        sa.Column("operator_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"], name=op.f("fk_body_composition_operator_id_users")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_body_composition_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_body_composition")),
    )
    op.create_index(op.f("ix_body_composition_measured_at"), "body_composition", ["measured_at"], unique=False)
    op.create_index(op.f("ix_body_composition_user_id"), "body_composition", ["user_id"], unique=False)

    op.create_table(
        "biochemical_index",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("fbg", sa.Float(), nullable=True),
        sa.Column("pbg_2h", sa.Float(), nullable=True),
        sa.Column("hba1c", sa.Float(), nullable=True),
        sa.Column("tc", sa.Float(), nullable=True),
        sa.Column("tg", sa.Float(), nullable=True),
        sa.Column("hdl_c", sa.Float(), nullable=True),
        sa.Column("ldl_c", sa.Float(), nullable=True),
        sa.Column("uric_acid", sa.Float(), nullable=True),
        sa.Column("creatinine", sa.Float(), nullable=True),
        sa.Column("alt", sa.Float(), nullable=True),
        sa.Column("ast", sa.Float(), nullable=True),
        sa.Column("hemoglobin", sa.Float(), nullable=True),
        sa.Column("spo2", sa.Float(), nullable=True),
        sa.Column("measured_at", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("report_file_url", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_biochemical_index_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_biochemical_index")),
    )
    op.create_index(op.f("ix_biochemical_index_measured_at"), "biochemical_index", ["measured_at"], unique=False)
    op.create_index(op.f("ix_biochemical_index_user_id"), "biochemical_index", ["user_id"], unique=False)

    op.create_table(
        "risk_screening",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("has_hypertension", sa.Boolean(), nullable=False),
        sa.Column("has_diabetes", sa.Boolean(), nullable=False),
        sa.Column("has_chd", sa.Boolean(), nullable=False),
        sa.Column("has_stroke", sa.Boolean(), nullable=False),
        sa.Column("has_ckd", sa.Boolean(), nullable=False),
        sa.Column("has_respiratory_disease", sa.Boolean(), nullable=False),
        sa.Column("has_osteoporosis", sa.Boolean(), nullable=True),
        sa.Column("has_joint_pain", sa.Boolean(), nullable=False),
        sa.Column("pain_location", sa.JSON(), nullable=False),
        sa.Column("recent_injury", sa.Boolean(), nullable=False),
        sa.Column("surgery_history", sa.Text(), nullable=True),
        sa.Column("medication", sa.JSON(), nullable=False),
        sa.Column("chest_pain", sa.Boolean(), nullable=False),
        sa.Column("syncope", sa.Boolean(), nullable=False),
        sa.Column("abnormal_dyspnea", sa.Boolean(), nullable=False),
        sa.Column("palpitation", sa.Boolean(), nullable=False),
        sa.Column("doctor_restriction", sa.Text(), nullable=True),
        sa.Column("parq_result", sa.String(length=32), nullable=True),
        sa.Column("risk_level", sa.String(length=16), nullable=True),
        sa.Column("risk_reasons", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_risk_screening_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_risk_screening")),
    )
    op.create_index(op.f("ix_risk_screening_created_at"), "risk_screening", ["created_at"], unique=False)
    op.create_index(op.f("ix_risk_screening_user_id"), "risk_screening", ["user_id"], unique=False)

    op.create_table(
        "exercise_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=True),
        sa.Column("exercise_date", sa.Date(), nullable=False),
        sa.Column("exercise_type", sa.String(length=64), nullable=False),
        sa.Column("frequency_week", sa.Integer(), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("intensity_level", sa.String(length=16), nullable=False),
        sa.Column("avg_hr", sa.Integer(), nullable=True),
        sa.Column("max_hr", sa.Integer(), nullable=True),
        sa.Column("pre_ex_bp_sbp", sa.Integer(), nullable=True),
        sa.Column("pre_ex_bp_dbp", sa.Integer(), nullable=True),
        sa.Column("post_ex_bp_sbp", sa.Integer(), nullable=True),
        sa.Column("post_ex_bp_dbp", sa.Integer(), nullable=True),
        sa.Column("pre_glucose", sa.Float(), nullable=True),
        sa.Column("post_glucose", sa.Float(), nullable=True),
        sa.Column("rpe", sa.Float(), nullable=False),
        sa.Column("completion_rate", sa.Float(), nullable=False),
        sa.Column("discomfort", sa.JSON(), nullable=False),
        sa.Column("discomfort_detail", sa.Text(), nullable=True),
        sa.Column("pain_score_after", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_exercise_feedback_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercise_feedback")),
    )
    op.create_index(op.f("ix_exercise_feedback_exercise_date"), "exercise_feedback", ["exercise_date"], unique=False)
    op.create_index(op.f("ix_exercise_feedback_prescription_id"), "exercise_feedback", ["prescription_id"], unique=False)
    op.create_index(op.f("ix_exercise_feedback_user_id"), "exercise_feedback", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_exercise_feedback_user_id"), table_name="exercise_feedback")
    op.drop_index(op.f("ix_exercise_feedback_prescription_id"), table_name="exercise_feedback")
    op.drop_index(op.f("ix_exercise_feedback_exercise_date"), table_name="exercise_feedback")
    op.drop_table("exercise_feedback")
    op.drop_index(op.f("ix_risk_screening_user_id"), table_name="risk_screening")
    op.drop_index(op.f("ix_risk_screening_created_at"), table_name="risk_screening")
    op.drop_table("risk_screening")
    op.drop_index(op.f("ix_biochemical_index_user_id"), table_name="biochemical_index")
    op.drop_index(op.f("ix_biochemical_index_measured_at"), table_name="biochemical_index")
    op.drop_table("biochemical_index")
    op.drop_index(op.f("ix_body_composition_user_id"), table_name="body_composition")
    op.drop_index(op.f("ix_body_composition_measured_at"), table_name="body_composition")
    op.drop_table("body_composition")
    op.drop_index(op.f("ix_fitness_test_user_id"), table_name="fitness_test")
    op.drop_index(op.f("ix_fitness_test_measured_at"), table_name="fitness_test")
    op.drop_table("fitness_test")
    op.drop_index(op.f("ix_user_profile_user_id"), table_name="user_profile")
    op.drop_table("user_profile")
    op.drop_index(op.f("ix_expert_profiles_user_id"), table_name="expert_profiles")
    op.drop_table("expert_profiles")
    op.drop_index(op.f("ix_audit_logs_resource_type"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_index(op.f("ix_users_phone"), table_name="users")
    op.drop_index(op.f("ix_users_organization_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_organizations_name"), table_name="organizations")
    op.drop_table("organizations")
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="organizationtype").drop(op.get_bind(), checkfirst=True)
