"""add research export scope and approval snapshot

Revision ID: 0020_research_export_scope
Revises: 0019_auth_refresh_tokens
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_research_export_scope"
down_revision: str | None = "0019_auth_refresh_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("research_export_requests") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("snapshot_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
        batch_op.create_foreign_key(
            "fk_research_export_requests_organization_id_organizations",
            "organizations",
            ["organization_id"],
            ["id"],
        )
    op.create_index(
        op.f("ix_research_export_requests_organization_id"),
        "research_export_requests",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_research_export_requests_organization_id"), table_name="research_export_requests")
    with op.batch_alter_table("research_export_requests") as batch_op:
        batch_op.drop_constraint("fk_research_export_requests_organization_id_organizations", type_="foreignkey")
        batch_op.drop_column("snapshot_json")
        batch_op.drop_column("organization_id")
