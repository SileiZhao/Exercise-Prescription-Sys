"""add cluster models and assignments

Revision ID: 0003_clusters
Revises: 0002_templates_knowledge
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_clusters"
down_revision: str | None = "0002_templates_knowledge"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cluster_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("algorithm", sa.String(length=32), nullable=False),
        sa.Column("n_clusters", sa.Integer(), nullable=False),
        sa.Column("feature_names", sa.JSON(), nullable=False),
        sa.Column("scaler_params", sa.JSON(), nullable=False),
        sa.Column("model_params", sa.JSON(), nullable=False),
        sa.Column("cluster_profiles", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_cluster_models_created_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cluster_models")),
    )
    op.create_index(op.f("ix_cluster_models_name"), "cluster_models", ["name"], unique=False)
    op.create_index(op.f("ix_cluster_models_status"), "cluster_models", ["status"], unique=False)

    op.create_table(
        "user_cluster_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=True),
        sa.Column("rule_labels", sa.JSON(), nullable=False),
        sa.Column("cluster_label", sa.String(length=128), nullable=True),
        sa.Column("cluster_id", sa.Integer(), nullable=True),
        sa.Column("profile_summary", sa.Text(), nullable=False),
        sa.Column("risk_override", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["cluster_models.id"], name=op.f("fk_user_cluster_assignments_model_id_cluster_models")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_cluster_assignments_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_cluster_assignments")),
    )
    op.create_index(op.f("ix_user_cluster_assignments_created_at"), "user_cluster_assignments", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_cluster_assignments_user_id"), "user_cluster_assignments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_cluster_assignments_user_id"), table_name="user_cluster_assignments")
    op.drop_index(op.f("ix_user_cluster_assignments_created_at"), table_name="user_cluster_assignments")
    op.drop_table("user_cluster_assignments")
    op.drop_index(op.f("ix_cluster_models_status"), table_name="cluster_models")
    op.drop_index(op.f("ix_cluster_models_name"), table_name="cluster_models")
    op.drop_table("cluster_models")
