"""add user informed consent records

Revision ID: 0008_user_consents
Revises: 0007_report_export_records
Create Date: 2026-06-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_user_consents"
down_revision: str | None = "0007_report_export_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_consents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("consent_version", sa.String(length=32), nullable=False),
        sa.Column("consent_text", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_consents_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_consents")),
    )
    op.create_index(op.f("ix_user_consents_accepted_at"), "user_consents", ["accepted_at"], unique=False)
    op.create_index(op.f("ix_user_consents_consent_version"), "user_consents", ["consent_version"], unique=False)
    op.create_index(op.f("ix_user_consents_is_active"), "user_consents", ["is_active"], unique=False)
    op.create_index(op.f("ix_user_consents_user_id"), "user_consents", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_consents_user_id"), table_name="user_consents")
    op.drop_index(op.f("ix_user_consents_is_active"), table_name="user_consents")
    op.drop_index(op.f("ix_user_consents_consent_version"), table_name="user_consents")
    op.drop_index(op.f("ix_user_consents_accepted_at"), table_name="user_consents")
    op.drop_table("user_consents")
