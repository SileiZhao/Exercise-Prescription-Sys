"""add action template and knowledge tables

Revision ID: 0002_templates_knowledge
Revises: 0001_initial
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_templates_knowledge"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    action_status = postgresql.ENUM(
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        name="actionreviewstatus",
        create_type=False,
    )
    template_status = postgresql.ENUM(
        "DRAFT",
        "APPROVED",
        "ARCHIVED",
        name="templatestatus",
        create_type=False,
    )
    action_status.create(op.get_bind(), checkfirst=True)
    template_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "exercise_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("suitable_tags", sa.JSON(), nullable=False),
        sa.Column("contraindication_tags", sa.JSON(), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("body_parts", sa.JSON(), nullable=False),
        sa.Column("intensity", sa.String(length=32), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("status", action_status, nullable=False),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], name=op.f("fk_exercise_actions_reviewed_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercise_actions")),
        sa.UniqueConstraint("name", name=op.f("uq_exercise_actions_name")),
    )
    op.create_index(op.f("ix_exercise_actions_category"), "exercise_actions", ["category"], unique=False)
    op.create_index(op.f("ix_exercise_actions_name"), "exercise_actions", ["name"], unique=False)
    op.create_index(op.f("ix_exercise_actions_risk_level"), "exercise_actions", ["risk_level"], unique=False)

    op.create_table(
        "prescription_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("cluster_tags", sa.JSON(), nullable=False),
        sa.Column("goal_tags", sa.JSON(), nullable=False),
        sa.Column("fitt_vp", sa.JSON(), nullable=False),
        sa.Column("precautions", sa.JSON(), nullable=False),
        sa.Column("contraindications", sa.JSON(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("status", template_status, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], name=op.f("fk_prescription_templates_approved_by_users")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_prescription_templates_created_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prescription_templates")),
    )
    op.create_index(op.f("ix_prescription_templates_name"), "prescription_templates", ["name"], unique=False)
    op.create_index(op.f("ix_prescription_templates_risk_level"), "prescription_templates", ["risk_level"], unique=False)
    op.create_index(op.f("ix_prescription_templates_status"), "prescription_templates", ["status"], unique=False)

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_knowledge_documents_created_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_documents")),
    )
    op.create_index(op.f("ix_knowledge_documents_category"), "knowledge_documents", ["category"], unique=False)
    op.create_index(op.f("ix_knowledge_documents_status"), "knowledge_documents", ["status"], unique=False)
    op.create_index(op.f("ix_knowledge_documents_title"), "knowledge_documents", ["title"], unique=False)

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("embedding_ref", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], name=op.f("fk_knowledge_chunks_document_id_knowledge_documents")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_chunks")),
    )
    op.create_index(op.f("ix_knowledge_chunks_document_id"), "knowledge_chunks", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_knowledge_chunks_document_id"), table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")
    op.drop_index(op.f("ix_knowledge_documents_title"), table_name="knowledge_documents")
    op.drop_index(op.f("ix_knowledge_documents_status"), table_name="knowledge_documents")
    op.drop_index(op.f("ix_knowledge_documents_category"), table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
    op.drop_index(op.f("ix_prescription_templates_status"), table_name="prescription_templates")
    op.drop_index(op.f("ix_prescription_templates_risk_level"), table_name="prescription_templates")
    op.drop_index(op.f("ix_prescription_templates_name"), table_name="prescription_templates")
    op.drop_table("prescription_templates")
    op.drop_index(op.f("ix_exercise_actions_risk_level"), table_name="exercise_actions")
    op.drop_index(op.f("ix_exercise_actions_name"), table_name="exercise_actions")
    op.drop_index(op.f("ix_exercise_actions_category"), table_name="exercise_actions")
    op.drop_table("exercise_actions")
    sa.Enum(name="templatestatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="actionreviewstatus").drop(op.get_bind(), checkfirst=True)
