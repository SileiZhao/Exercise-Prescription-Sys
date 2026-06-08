"""add cluster model governance fields

Revision ID: 0016_cluster_model_governance
Revises: 0015_knowledge_fields
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_cluster_model_governance"
down_revision: str | None = "0015_knowledge_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("cluster_models") as batch_op:
        batch_op.add_column(
            sa.Column("model_origin", sa.String(length=64), nullable=False, server_default="bootstrap_rule_calibrated")
        )


def downgrade() -> None:
    with op.batch_alter_table("cluster_models") as batch_op:
        batch_op.drop_column("model_origin")
