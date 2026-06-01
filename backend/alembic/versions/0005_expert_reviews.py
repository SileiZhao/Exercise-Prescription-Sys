"""add expert reviews

Revision ID: 0005_expert_reviews
Revises: 0004_prescriptions
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_expert_reviews"
down_revision: str | None = "0004_prescriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "expert_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expert_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("edited_prescription", sa.JSON(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["expert_id"], ["users.id"], name=op.f("fk_expert_reviews_expert_id_users")),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescription_records.id"], name=op.f("fk_expert_reviews_prescription_id_prescription_records")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_expert_reviews_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expert_reviews")),
    )
    op.create_index(op.f("ix_expert_reviews_created_at"), "expert_reviews", ["created_at"], unique=False)
    op.create_index(op.f("ix_expert_reviews_expert_id"), "expert_reviews", ["expert_id"], unique=False)
    op.create_index(op.f("ix_expert_reviews_prescription_id"), "expert_reviews", ["prescription_id"], unique=False)
    op.create_index(op.f("ix_expert_reviews_status"), "expert_reviews", ["status"], unique=False)
    op.create_index(op.f("ix_expert_reviews_user_id"), "expert_reviews", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_expert_reviews_user_id"), table_name="expert_reviews")
    op.drop_index(op.f("ix_expert_reviews_status"), table_name="expert_reviews")
    op.drop_index(op.f("ix_expert_reviews_prescription_id"), table_name="expert_reviews")
    op.drop_index(op.f("ix_expert_reviews_expert_id"), table_name="expert_reviews")
    op.drop_index(op.f("ix_expert_reviews_created_at"), table_name="expert_reviews")
    op.drop_table("expert_reviews")
