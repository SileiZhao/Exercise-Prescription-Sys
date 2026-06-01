"""add admin managed risk rules

Revision ID: 0006_admin_risk_rules
Revises: 0005_expert_reviews
Create Date: 2026-05-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_admin_risk_rules"
down_revision: str | None = "0005_expert_reviews"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "risk_rule_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("condition", sa.JSON(), nullable=False),
        sa.Column("contraindications", sa.JSON(), nullable=False),
        sa.Column("intensity_cap", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_risk_rule_configs_created_by_users")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_risk_rule_configs_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_risk_rule_configs")),
        sa.UniqueConstraint("code", name=op.f("uq_risk_rule_configs_code")),
    )
    op.create_index(op.f("ix_risk_rule_configs_code"), "risk_rule_configs", ["code"], unique=False)
    op.create_index(op.f("ix_risk_rule_configs_is_active"), "risk_rule_configs", ["is_active"], unique=False)
    op.create_index(op.f("ix_risk_rule_configs_name"), "risk_rule_configs", ["name"], unique=False)
    op.create_index(op.f("ix_risk_rule_configs_severity"), "risk_rule_configs", ["severity"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_risk_rule_configs_severity"), table_name="risk_rule_configs")
    op.drop_index(op.f("ix_risk_rule_configs_name"), table_name="risk_rule_configs")
    op.drop_index(op.f("ix_risk_rule_configs_is_active"), table_name="risk_rule_configs")
    op.drop_index(op.f("ix_risk_rule_configs_code"), table_name="risk_rule_configs")
    op.drop_table("risk_rule_configs")
