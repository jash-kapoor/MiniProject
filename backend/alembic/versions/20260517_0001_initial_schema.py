"""initial schema

Revision ID: 20260517_0001
Revises:
Create Date: 2026-05-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260517_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    json_type = _json_type()

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "interviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=True),
        sa.Column("job_title", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interviews_candidate_id", "interviews", ["candidate_id"])

    op.create_table(
        "evaluations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("interview_id", sa.Integer(), nullable=True),
        sa.Column("speech_score", sa.Float(), nullable=True),
        sa.Column("nlp_score", sa.Float(), nullable=True),
        sa.Column("vision_score", sa.Float(), nullable=True),
        sa.Column("fairness_score", sa.Float(), nullable=True),
        sa.Column("fairness_adjustment", sa.Float(), nullable=True),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("detailed_feedback", json_type, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evaluations_interview_id", "evaluations", ["interview_id"])

    op.create_table(
        "interview_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("interview_id", sa.Integer(), nullable=True),
        sa.Column("answers", json_type, nullable=True),
        sa.Column("monitoring", json_type, nullable=True),
        sa.Column("violations", json_type, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interview_reports_interview_id", "interview_reports", ["interview_id"], unique=True)

    op.create_table(
        "live_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.String(), nullable=True),
        sa.Column("interview_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_live_sessions_meeting_id", "live_sessions", ["meeting_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_live_sessions_meeting_id", table_name="live_sessions")
    op.drop_table("live_sessions")
    op.drop_index("ix_interview_reports_interview_id", table_name="interview_reports")
    op.drop_table("interview_reports")
    op.drop_index("ix_evaluations_interview_id", table_name="evaluations")
    op.drop_table("evaluations")
    op.drop_index("ix_interviews_candidate_id", table_name="interviews")
    op.drop_table("interviews")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
