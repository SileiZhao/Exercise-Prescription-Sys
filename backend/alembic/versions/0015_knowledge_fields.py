"""add knowledge import metadata fields

Revision ID: 0015_knowledge_fields
Revises: 0014_template_fields
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_knowledge_fields"
down_revision: str | None = "0014_template_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.add_column(sa.Column("import_batch_id", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("credibility_level", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("skipped_reason", sa.String(length=500), nullable=True))
    op.create_index(op.f("ix_knowledge_documents_import_batch_id"), "knowledge_documents", ["import_batch_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_knowledge_documents_import_batch_id"), table_name="knowledge_documents")
    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.drop_column("skipped_reason")
        batch_op.drop_column("credibility_level")
        batch_op.drop_column("import_batch_id")
