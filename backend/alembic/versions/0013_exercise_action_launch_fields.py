"""add exercise action launch fields

Revision ID: 0013_action_launch_fields
Revises: 0012_launch_content_metadata
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_action_launch_fields"
down_revision: str | None = "0012_launch_content_metadata"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exercise_actions") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("source_exercise_id", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("name_en", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("exercise_type", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("image_url", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("joint_stress_level", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("impact_level", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("requires_equipment", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(
            sa.Column("is_traditional_exercise", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("exercise_actions") as batch_op:
        batch_op.alter_column("requires_equipment", server_default=None)
        batch_op.alter_column("is_traditional_exercise", server_default=None)
    op.create_index(op.f("ix_exercise_actions_source_exercise_id"), "exercise_actions", ["source_exercise_id"], unique=False)
    op.create_index(op.f("ix_exercise_actions_exercise_type"), "exercise_actions", ["exercise_type"], unique=False)
    op.create_index(
        op.f("ix_exercise_actions_is_traditional_exercise"),
        "exercise_actions",
        ["is_traditional_exercise"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_exercise_actions_is_traditional_exercise"), table_name="exercise_actions")
    op.drop_index(op.f("ix_exercise_actions_exercise_type"), table_name="exercise_actions")
    op.drop_index(op.f("ix_exercise_actions_source_exercise_id"), table_name="exercise_actions")
    with op.batch_alter_table("exercise_actions") as batch_op:
        batch_op.drop_column("is_traditional_exercise")
        batch_op.drop_column("requires_equipment")
        batch_op.drop_column("impact_level")
        batch_op.drop_column("joint_stress_level")
        batch_op.drop_column("image_url")
        batch_op.drop_column("exercise_type")
        batch_op.drop_column("name_en")
        batch_op.drop_column("source_exercise_id")
        batch_op.drop_column("source")
