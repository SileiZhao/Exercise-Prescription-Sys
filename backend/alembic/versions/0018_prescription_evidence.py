"""add prescription evidence

Revision ID: 0018_prescription_evidence
Revises: 0017_research_export_requests
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_prescription_evidence"
down_revision: str | None = "0017_research_export_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "prescription_evidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=False),
        sa.Column("risk_rules", sa.JSON(), nullable=False),
        sa.Column("template_ref", sa.JSON(), nullable=False),
        sa.Column("action_refs", sa.JSON(), nullable=False),
        sa.Column("rag_chunks", sa.JSON(), nullable=False),
        sa.Column("llm_provider", sa.String(length=64), nullable=False),
        sa.Column("llm_model", sa.String(length=128), nullable=True),
        sa.Column("schema_validation", sa.JSON(), nullable=False),
        sa.Column("safety_validation", sa.JSON(), nullable=False),
        sa.Column("object_refs", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescription_records.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_prescription_evidence_prescription_id"), "prescription_evidence", ["prescription_id"], unique=True)
    op.create_index(op.f("ix_prescription_evidence_created_at"), "prescription_evidence", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_prescription_evidence_created_at"), table_name="prescription_evidence")
    op.drop_index(op.f("ix_prescription_evidence_prescription_id"), table_name="prescription_evidence")
    op.drop_table("prescription_evidence")
