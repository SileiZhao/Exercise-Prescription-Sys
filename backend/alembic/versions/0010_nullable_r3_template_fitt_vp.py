"""allow R3 templates without FITT-VP

Revision ID: 0010_r3_fitt_nullable
Revises: 0009_feedback_confirm
Create Date: 2026-06-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_r3_fitt_nullable"
down_revision: str | None = "0009_feedback_confirm"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("prescription_templates") as batch_op:
        batch_op.alter_column("fitt_vp", existing_type=sa.JSON(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("prescription_templates") as batch_op:
        batch_op.alter_column("fitt_vp", existing_type=sa.JSON(), nullable=False)
