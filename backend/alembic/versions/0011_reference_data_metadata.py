"""add reference data metadata and compliance documents

Revision ID: 0011_reference_data_metadata
Revises: 0010_r3_fitt_nullable
Create Date: 2026-06-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_reference_data_metadata"
down_revision: str | None = "0010_r3_fitt_nullable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exercise_actions") as batch_op:
        batch_op.add_column(sa.Column("primary_muscles", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("equipment", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("difficulty", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("alternatives", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("common_mistakes", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("monitoring_tips", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("stop_signals", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("evidence_refs", sa.JSON(), nullable=True))

    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.add_column(sa.Column("source_type", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("version", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("published_year", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("file_path", sa.String(length=512), nullable=True))

    with op.batch_alter_table("knowledge_chunks") as batch_op:
        batch_op.add_column(sa.Column("source_section", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("page_start", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("page_end", sa.Integer(), nullable=True))

    op.create_table(
        "compliance_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=96), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("effective_date", sa.String(length=64), nullable=True),
        sa.Column("applicable_scope", sa.Text(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("short_notice", sa.Text(), nullable=True),
        sa.Column("checkbox_text", sa.Text(), nullable=True),
        sa.Column("evidence_refs", sa.JSON(), nullable=True),
        sa.Column("pending_confirmation", sa.JSON(), nullable=True),
        sa.Column("review_status", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_compliance_documents")),
    )
    op.create_index(op.f("ix_compliance_documents_code"), "compliance_documents", ["code"], unique=True)
    op.create_index(op.f("ix_compliance_documents_status"), "compliance_documents", ["status"], unique=False)
    op.create_index(op.f("ix_compliance_documents_title"), "compliance_documents", ["title"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_compliance_documents_title"), table_name="compliance_documents")
    op.drop_index(op.f("ix_compliance_documents_status"), table_name="compliance_documents")
    op.drop_index(op.f("ix_compliance_documents_code"), table_name="compliance_documents")
    op.drop_table("compliance_documents")

    with op.batch_alter_table("knowledge_chunks") as batch_op:
        batch_op.drop_column("page_end")
        batch_op.drop_column("page_start")
        batch_op.drop_column("source_section")

    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.drop_column("file_path")
        batch_op.drop_column("published_year")
        batch_op.drop_column("version")
        batch_op.drop_column("source_type")

    with op.batch_alter_table("exercise_actions") as batch_op:
        batch_op.drop_column("evidence_refs")
        batch_op.drop_column("stop_signals")
        batch_op.drop_column("monitoring_tips")
        batch_op.drop_column("common_mistakes")
        batch_op.drop_column("alternatives")
        batch_op.drop_column("difficulty")
        batch_op.drop_column("equipment")
        batch_op.drop_column("primary_muscles")
