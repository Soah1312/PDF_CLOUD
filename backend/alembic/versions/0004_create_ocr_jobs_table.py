"""create ocr_jobs table for OCRmyPDF and Tesseract OCR Studio

Revision ID: 0004_create_ocr_jobs
Revises: 0003_canary_and_workflow_enhancements
Create Date: 2026-11-11 19:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0004_create_ocr_jobs'
down_revision: Union[str, None] = '0003_canary_and_workflow_enhancements'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'ocr_jobs' not in inspector.get_table_names():
        op.create_table(
            'ocr_jobs',
            sa.Column('id', sa.Uuid(), primary_key=True),
            sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
            sa.Column('guest_session_id', sa.String(length=64), nullable=True),
            sa.Column('original_filename', sa.String(length=255), nullable=False),
            sa.Column('original_s3_key', sa.String(length=512), nullable=False),
            sa.Column('output_s3_key', sa.String(length=512), nullable=True),
            sa.Column('ocr_engine', sa.String(length=64), nullable=False, server_default='ocrmypdf'),
            sa.Column('language', sa.String(length=32), nullable=False, server_default='eng'),
            sa.Column('page_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('file_size_bytes', sa.BigInteger(), nullable=False, server_default='0'),
            sa.Column('output_file_size_bytes', sa.BigInteger(), nullable=True, server_default='0'),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='PENDING'),
            sa.Column('processing_stage', sa.String(length=64), nullable=False, server_default='QUEUED'),
            sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('has_digital_text', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('force_ocr', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('detected_words', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_ocr_jobs_user_id', 'ocr_jobs', ['user_id'])
        op.create_index('ix_ocr_jobs_guest_session_id', 'ocr_jobs', ['guest_session_id'])
        op.create_index('ix_ocr_jobs_status', 'ocr_jobs', ['status'])
        op.create_index('ix_ocr_jobs_expires_at', 'ocr_jobs', ['expires_at'])
    else:
        existing_cols = {col['name'] for col in inspector.get_columns('ocr_jobs')}
        if 'ocr_engine' not in existing_cols:
            op.add_column('ocr_jobs', sa.Column('ocr_engine', sa.String(length=64), nullable=False, server_default='ocrmypdf'))
        if 'language' not in existing_cols:
            op.add_column('ocr_jobs', sa.Column('language', sa.String(length=32), nullable=False, server_default='eng'))
        if 'textract_job_id' in existing_cols:
            try:
                op.drop_index('ix_ocr_jobs_textract_job_id', table_name='ocr_jobs')
            except Exception:
                pass
            op.drop_column('ocr_jobs', 'textract_job_id')


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if 'ocr_jobs' in inspector.get_table_names():
        op.drop_index('ix_ocr_jobs_expires_at', table_name='ocr_jobs')
        op.drop_index('ix_ocr_jobs_status', table_name='ocr_jobs')
        op.drop_index('ix_ocr_jobs_guest_session_id', table_name='ocr_jobs')
        op.drop_index('ix_ocr_jobs_user_id', table_name='ocr_jobs')
        op.drop_table('ocr_jobs')
