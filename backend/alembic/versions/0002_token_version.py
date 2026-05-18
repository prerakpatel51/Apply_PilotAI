"""add users.token_version (idempotent)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # 0001 runs Base.metadata.create_all on a fresh DB, so the column may
    # already exist. Only add it when missing (older DBs migrating in place).
    if not _has_column(bind, "users", "token_version"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("token_version", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "users", "token_version"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("token_version")
