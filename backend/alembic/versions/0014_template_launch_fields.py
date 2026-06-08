"""add prescription template launch fields

Revision ID: 0014_template_fields
Revises: 0013_action_launch_fields
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_template_fields"
down_revision: str | None = "0013_action_launch_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("prescription_templates") as batch_op:
        batch_op.add_column(sa.Column("template_code", sa.String(length=96), nullable=True))
        batch_op.add_column(sa.Column("source_version", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column("review_status", sa.String(length=64), nullable=False, server_default="EXPERT_REVIEW_DRAFT")
        )
    with op.batch_alter_table("prescription_templates") as batch_op:
        batch_op.alter_column("review_status", server_default=None)
    op.create_index(op.f("ix_prescription_templates_template_code"), "prescription_templates", ["template_code"], unique=False)
    op.create_index(op.f("ix_prescription_templates_review_status"), "prescription_templates", ["review_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_prescription_templates_review_status"), table_name="prescription_templates")
    op.drop_index(op.f("ix_prescription_templates_template_code"), table_name="prescription_templates")
    with op.batch_alter_table("prescription_templates") as batch_op:
        batch_op.drop_column("review_status")
        batch_op.drop_column("source_version")
        batch_op.drop_column("template_code")
