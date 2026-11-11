"""add canary metadata and workflow tracking columns

Revision ID: 0003_canary_and_workflow
Revises: 0002_add_stage2_cols
Create Date: 2026-11-09 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0003_canary_and_workflow_enhancements'
down_revision: Union[str, None] = '0002_add_stage2_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # 1. Update canary_tokens table
    if 'canary_tokens' in inspector.get_table_names():
        canary_columns = [col['name'] for col in inspector.get_columns('canary_tokens')]

        if 'recipient_name' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('recipient_name', sa.String(length=128), nullable=True))

        if 'recipient_email' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('recipient_email', sa.String(length=128), nullable=True))

        if 'organization' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('organization', sa.String(length=128), nullable=True))

        if 'tracking_note' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('tracking_note', sa.String(length=255), nullable=True))

        if 'original_sha256' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('original_sha256', sa.String(length=64), nullable=True))

        if 'watermarked_sha256' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('watermarked_sha256', sa.String(length=64), nullable=True))

        if 'steganography_method' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('steganography_method', sa.String(length=32), nullable=True, server_default='DUAL_LAYER'))

        if 'status' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('status', sa.String(length=32), nullable=True, server_default='ACTIVE'))

        if 'revoked_at' not in canary_columns:
            op.add_column('canary_tokens', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))

        canary_indexes = [idx['name'] for idx in inspector.get_indexes('canary_tokens')]
        if 'ix_canary_tokens_status' not in canary_indexes:
            op.create_index('ix_canary_tokens_status', 'canary_tokens', ['status'])

    # 2. Update saved_workflows table
    if 'saved_workflows' in inspector.get_table_names():
        workflow_columns = [col['name'] for col in inspector.get_columns('saved_workflows')]
        if 'updated_at' not in workflow_columns:
            op.add_column('saved_workflows', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'canary_tokens' in inspector.get_table_names():
        canary_indexes = [idx['name'] for idx in inspector.get_indexes('canary_tokens')]
        if 'ix_canary_tokens_status' in canary_indexes:
            op.drop_index('ix_canary_tokens_status', table_name='canary_tokens')

        canary_columns = [col['name'] for col in inspector.get_columns('canary_tokens')]
        for col in [
            'revoked_at',
            'status',
            'steganography_method',
            'watermarked_sha256',
            'original_sha256',
            'tracking_note',
            'organization',
            'recipient_email',
            'recipient_name'
        ]:
            if col in canary_columns:
                op.drop_column('canary_tokens', col)

    if 'saved_workflows' in inspector.get_table_names():
        workflow_columns = [col['name'] for col in inspector.get_columns('saved_workflows')]
        if 'updated_at' in workflow_columns:
            op.drop_column('saved_workflows', 'updated_at')

