"""initial stage1 schema

Revision ID: 0001_initial_stage1
Revises: 
Create Date: 2026-11-09 01:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0001_initial_stage1'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Table: users
    if 'users' not in existing_tables:
        op.create_table(
            'users',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('cognito_sub', sa.String(length=64), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('storage_used_bytes', sa.BigInteger(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('email')
        )
        op.create_index('ix_users_cognito_sub', 'users', ['cognito_sub'], unique=True)

    # 2. Table: pdf_jobs (Base Stage 1 columns)
    if 'pdf_jobs' not in existing_tables:
        op.create_table(
            'pdf_jobs',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=True),
            sa.Column('session_id', sa.String(length=64), nullable=True),
            sa.Column('action_type', sa.String(length=64), nullable=False),
            sa.Column('is_pipeline', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('pipeline_steps', sa.JSON(), nullable=True),
            sa.Column('original_filename', sa.String(length=255), nullable=False),
            sa.Column('s3_input_key', sa.String(length=512), nullable=False),
            sa.Column('s3_output_key', sa.String(length=512), nullable=True),
            sa.Column('file_size_bytes', sa.BigInteger(), nullable=False, server_default='0'),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='PENDING'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_pdf_jobs_user_id', 'pdf_jobs', ['user_id'])
        op.create_index('ix_pdf_jobs_session_id', 'pdf_jobs', ['session_id'])

    # 3. Table: canary_tokens
    if 'canary_tokens' not in existing_tables:
        op.create_table(
            'canary_tokens',
            sa.Column('token_id', sa.String(length=64), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('job_id', sa.Uuid(), nullable=False),
            sa.Column('download_ip', sa.String(length=64), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['job_id'], ['pdf_jobs.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('token_id')
        )
        op.create_index('ix_canary_tokens_user_id', 'canary_tokens', ['user_id'])
        op.create_index('ix_canary_tokens_job_id', 'canary_tokens', ['job_id'])

    # 4. Table: saved_workflows
    if 'saved_workflows' not in existing_tables:
        op.create_table(
            'saved_workflows',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('name', sa.String(length=128), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=True),
            sa.Column('steps', sa.JSON(), nullable=False),
            sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_saved_workflows_user_id', 'saved_workflows', ['user_id'])


def downgrade() -> None:
    # Safe reversible downgrade
    op.drop_table('saved_workflows')
    op.drop_table('canary_tokens')
    op.drop_table('pdf_jobs')
    op.drop_table('users')
