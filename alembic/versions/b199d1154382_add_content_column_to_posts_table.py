"""add content column to posts table

Revision ID: b199d1154382
Revises: 23133f2bceb9
Create Date: 2026-06-23 16:21:28.427305

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b199d1154382'
down_revision: Union[str, Sequence[str], None] = '23133f2bceb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('posts',
                  sa.Column('content', sa.String(), nullable=False)
                  )
    pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('posts', 'content')
    pass
