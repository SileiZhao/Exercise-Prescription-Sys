"""add launch content metadata

Revision ID: 0012_launch_content_metadata
Revises: 0011_reference_data_metadata
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_launch_content_metadata"
down_revision: str | None = "0011_reference_data_metadata"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("risk_rule_configs") as batch_op:
        batch_op.add_column(sa.Column("priority", sa.Integer(), nullable=False, server_default="100"))
        batch_op.add_column(sa.Column("rule_type", sa.String(length=64), nullable=False, server_default="RISK_LEVEL"))
        batch_op.add_column(sa.Column("source_ref", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("applies_to", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(
            sa.Column("review_status", sa.String(length=64), nullable=False, server_default="EXPERT_REVIEW_DRAFT")
        )
    with op.batch_alter_table("risk_rule_configs") as batch_op:
        batch_op.alter_column("priority", server_default=None)
        batch_op.alter_column("rule_type", server_default=None)
        batch_op.alter_column("applies_to", server_default=None)
        batch_op.alter_column("review_status", server_default=None)
    op.create_index(op.f("ix_risk_rule_configs_priority"), "risk_rule_configs", ["priority"], unique=False)
    op.create_index(op.f("ix_risk_rule_configs_rule_type"), "risk_rule_configs", ["rule_type"], unique=False)
    op.create_index(op.f("ix_risk_rule_configs_review_status"), "risk_rule_configs", ["review_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_risk_rule_configs_review_status"), table_name="risk_rule_configs")
    op.drop_index(op.f("ix_risk_rule_configs_rule_type"), table_name="risk_rule_configs")
    op.drop_index(op.f("ix_risk_rule_configs_priority"), table_name="risk_rule_configs")
    with op.batch_alter_table("risk_rule_configs") as batch_op:
        batch_op.drop_column("review_status")
        batch_op.drop_column("applies_to")
        batch_op.drop_column("source_ref")
        batch_op.drop_column("rule_type")
        batch_op.drop_column("priority")
