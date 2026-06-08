"""add user profile measurement history

Revision ID: 0021_user_profile_measurements
Revises: 0020_research_export_scope
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_user_profile_measurements"
down_revision: str | None = "0020_research_export_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_profile_measurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("bmi", sa.Float(), nullable=False),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("hip_cm", sa.Float(), nullable=True),
        sa.Column("whr", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("measured_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_profile_measurements_user_id"), "user_profile_measurements", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_user_profile_measurements_measured_at"),
        "user_profile_measurements",
        ["measured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_profile_measurements_measured_at"), table_name="user_profile_measurements")
    op.drop_index(op.f("ix_user_profile_measurements_user_id"), table_name="user_profile_measurements")
    op.drop_table("user_profile_measurements")
