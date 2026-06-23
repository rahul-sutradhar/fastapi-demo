"""Add foreign-key to posts table

Revision ID: ab8aaf0fc6ad
Revises: cd2879b501d7
Create Date: 2026-06-23 16:33:30.312932

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab8aaf0fc6ad'
down_revision: Union[str, Sequence[str], None] = 'cd2879b501d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('posts',
                  sa.Column('owner_id', sa.Integer(), nullable=False)
                  )
    op.create_foreign_key('post_user_fk',
                          source_table="posts",
                          referent_table="users", 
                          local_cols=['owner_id'], 
                          remote_cols=['id'], 
                          ondelete="CASCADE"
                          )
    pass


def downgrade() -> None:
    """Downgrade schema."""
    # op.drop_constraint('post_users_fk', table_name="posts")
    op.execute('ALTER TABLE posts DROP CONSTRAINT IF EXISTS post_users_fk')
    op.drop_column('posts', 'owner_id')
    pass
