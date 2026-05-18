"""baseline schema from SQLAlchemy models

Revision ID: 0001
Revises:
Create Date: 2026-05-18

This baseline stamps existing schema. For fresh prod DBs, use:
    alembic upgrade head
which calls Base.metadata.create_all via op.execute equivalents.
For an existing dev DB that already has tables, run:
    alembic stamp 0001
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.models.db import Base


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
