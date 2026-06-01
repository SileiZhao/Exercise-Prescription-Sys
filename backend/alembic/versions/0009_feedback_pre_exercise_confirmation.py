"""add pre exercise confirmation to feedback

Revision ID: 0009_feedback_confirm
Revises: 0008_user_consents
Create Date: 2026-06-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_feedback_confirm"
down_revision: str | None = "0008_user_consents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exercise_feedback",
        sa.Column("pre_exercise_confirmed", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("exercise_feedback", "pre_exercise_confirmed", server_default=None)


def downgrade() -> None:
    op.drop_column("exercise_feedback", "pre_exercise_confirmed")
