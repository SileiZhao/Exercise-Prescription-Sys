"""add research export requests

Revision ID: 0017_research_export_requests
Revises: 0016_cluster_model_governance
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_research_export_requests"
down_revision: str | None = "0016_cluster_model_governance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "research_export_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_research_export_requests_requested_by"), "research_export_requests", ["requested_by"], unique=False)
    op.create_index(op.f("ix_research_export_requests_approved_by"), "research_export_requests", ["approved_by"], unique=False)
    op.create_index(op.f("ix_research_export_requests_format"), "research_export_requests", ["format"], unique=False)
    op.create_index(op.f("ix_research_export_requests_status"), "research_export_requests", ["status"], unique=False)
    op.create_index(op.f("ix_research_export_requests_expires_at"), "research_export_requests", ["expires_at"], unique=False)
    op.create_index(op.f("ix_research_export_requests_created_at"), "research_export_requests", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_research_export_requests_created_at"), table_name="research_export_requests")
    op.drop_index(op.f("ix_research_export_requests_expires_at"), table_name="research_export_requests")
    op.drop_index(op.f("ix_research_export_requests_status"), table_name="research_export_requests")
    op.drop_index(op.f("ix_research_export_requests_format"), table_name="research_export_requests")
    op.drop_index(op.f("ix_research_export_requests_approved_by"), table_name="research_export_requests")
    op.drop_index(op.f("ix_research_export_requests_requested_by"), table_name="research_export_requests")
    op.drop_table("research_export_requests")
