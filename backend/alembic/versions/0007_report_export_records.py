"""add report export records

Revision ID: 0007_report_export_records
Revises: 0006_admin_risk_rules
Create Date: 2026-05-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_report_export_records"
down_revision: str | None = "0006_admin_risk_rules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_export_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("exported_by", sa.Integer(), nullable=False),
        sa.Column("prescription_id", sa.Integer(), nullable=True),
        sa.Column("report_type", sa.String(length=32), nullable=False),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("version", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["exported_by"], ["users.id"], name=op.f("fk_report_export_records_exported_by_users")),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescription_records.id"], name=op.f("fk_report_export_records_prescription_id_prescription_records")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_report_export_records_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_report_export_records")),
    )
    op.create_index(op.f("ix_report_export_records_created_at"), "report_export_records", ["created_at"], unique=False)
    op.create_index(op.f("ix_report_export_records_exported_by"), "report_export_records", ["exported_by"], unique=False)
    op.create_index(op.f("ix_report_export_records_format"), "report_export_records", ["format"], unique=False)
    op.create_index(op.f("ix_report_export_records_prescription_id"), "report_export_records", ["prescription_id"], unique=False)
    op.create_index(op.f("ix_report_export_records_report_type"), "report_export_records", ["report_type"], unique=False)
    op.create_index(op.f("ix_report_export_records_user_id"), "report_export_records", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_report_export_records_user_id"), table_name="report_export_records")
    op.drop_index(op.f("ix_report_export_records_report_type"), table_name="report_export_records")
    op.drop_index(op.f("ix_report_export_records_prescription_id"), table_name="report_export_records")
    op.drop_index(op.f("ix_report_export_records_format"), table_name="report_export_records")
    op.drop_index(op.f("ix_report_export_records_exported_by"), table_name="report_export_records")
    op.drop_index(op.f("ix_report_export_records_created_at"), table_name="report_export_records")
    op.drop_table("report_export_records")
