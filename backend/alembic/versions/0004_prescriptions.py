"""add prescription records and versions

Revision ID: 0004_prescriptions
Revises: 0003_clusters
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_prescriptions"
down_revision: str | None = "0003_clusters"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "prescription_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("cluster_label", sa.String(length=128), nullable=True),
        sa.Column("goals", sa.JSON(), nullable=False),
        sa.Column("fitt_vp", sa.JSON(), nullable=True),
        sa.Column("precautions", sa.JSON(), nullable=False),
        sa.Column("contraindications", sa.JSON(), nullable=False),
        sa.Column("reassessment", sa.String(length=128), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("llm_payload", sa.JSON(), nullable=False),
        sa.Column("safety_notice", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("expert_review_required", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["prescription_records.id"], name=op.f("fk_prescription_records_parent_id_prescription_records")),
        sa.ForeignKeyConstraint(["template_id"], ["prescription_templates.id"], name=op.f("fk_prescription_records_template_id_prescription_templates")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_prescription_records_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prescription_records")),
    )
    op.create_index(op.f("ix_prescription_records_created_at"), "prescription_records", ["created_at"], unique=False)
    op.create_index(op.f("ix_prescription_records_risk_level"), "prescription_records", ["risk_level"], unique=False)
    op.create_index(op.f("ix_prescription_records_status"), "prescription_records", ["status"], unique=False)
    op.create_index(op.f("ix_prescription_records_user_id"), "prescription_records", ["user_id"], unique=False)

    op.create_table(
        "prescription_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("change_reason", sa.String(length=255), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], name=op.f("fk_prescription_versions_actor_id_users")),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescription_records.id"], name=op.f("fk_prescription_versions_prescription_id_prescription_records")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prescription_versions")),
    )
    op.create_index(op.f("ix_prescription_versions_prescription_id"), "prescription_versions", ["prescription_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_prescription_versions_prescription_id"), table_name="prescription_versions")
    op.drop_table("prescription_versions")
    op.drop_index(op.f("ix_prescription_records_user_id"), table_name="prescription_records")
    op.drop_index(op.f("ix_prescription_records_status"), table_name="prescription_records")
    op.drop_index(op.f("ix_prescription_records_risk_level"), table_name="prescription_records")
    op.drop_index(op.f("ix_prescription_records_created_at"), table_name="prescription_records")
    op.drop_table("prescription_records")
