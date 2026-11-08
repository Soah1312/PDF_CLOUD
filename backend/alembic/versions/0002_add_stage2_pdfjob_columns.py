"""add stage2 pdfjob columns

Revision ID: 0002_add_stage2_cols
Revises: 0001_initial_stage1
Create Date: 2026-11-09 01:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0002_add_stage2_cols'
down_revision: Union[str, None] = '0001_initial_stage1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = [col['name'] for col in inspector.get_columns('pdf_jobs')]

    # 1. output_file_size_bytes
    if 'output_file_size_bytes' not in existing_columns:
        op.add_column(
            'pdf_jobs',
            sa.Column('output_file_size_bytes', sa.BigInteger(), nullable=True, server_default='0')
        )

    # 2. mime_type
    if 'mime_type' not in existing_columns:
        op.add_column(
            'pdf_jobs',
            sa.Column('mime_type', sa.String(length=128), nullable=True, server_default='application/pdf')
        )

    # 3. output_mime_type
    if 'output_mime_type' not in existing_columns:
        op.add_column(
            'pdf_jobs',
            sa.Column('output_mime_type', sa.String(length=128), nullable=True)
        )

    # 4. completed_at
    if 'completed_at' not in existing_columns:
        op.add_column(
            'pdf_jobs',
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True)
        )

    # 5. expires_at
    if 'expires_at' not in existing_columns:
        op.add_column(
            'pdf_jobs',
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True)
        )

    # Index on expires_at for guest cleanup queries
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('pdf_jobs')]
    if 'ix_pdf_jobs_expires_at' not in existing_indexes:
        op.create_index('ix_pdf_jobs_expires_at', 'pdf_jobs', ['expires_at'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('pdf_jobs')]
    if 'ix_pdf_jobs_expires_at' in existing_indexes:
        op.drop_index('ix_pdf_jobs_expires_at', table_name='pdf_jobs')

    existing_columns = [col['name'] for col in inspector.get_columns('pdf_jobs')]
    for col in ['expires_at', 'completed_at', 'output_mime_type', 'mime_type', 'output_file_size_bytes']:
        if col in existing_columns:
            op.drop_column('pdf_jobs', col)

