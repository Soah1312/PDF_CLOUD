import os
import pytest
from sqlalchemy import create_engine, inspect
from alembic.config import Config
from alembic import command


@pytest.fixture
def test_db_path(tmp_path):
    """Provides a temporary SQLite database file for testing migrations."""
    db_file = tmp_path / "migration_test.db"
    return str(db_file)


def get_alembic_config(db_path: str) -> Config:
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ini_path = os.path.join(backend_dir, "alembic.ini")
    script_loc = os.path.join(backend_dir, "alembic")

    cfg = Config(ini_path)
    cfg.set_main_option("script_location", script_loc)
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return cfg


def test_alembic_upgrade_and_downgrade(test_db_path):
    """
    Verifies that Alembic can successfully upgrade to head (creating Stage 1 tables
    and adding Stage 2 PDFJob columns), and reversibly downgrade.
    """
    cfg = get_alembic_config(test_db_path)

    # 1. Upgrade to head
    command.upgrade(cfg, "head")

    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)

    # Verify all expected tables exist
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "pdf_jobs" in tables
    assert "canary_tokens" in tables
    assert "saved_workflows" in tables

    # Verify Stage 2 columns in pdf_jobs
    columns = {col["name"]: col for col in inspector.get_columns("pdf_jobs")}
    assert "output_file_size_bytes" in columns
    assert "mime_type" in columns
    assert "output_mime_type" in columns
    assert "completed_at" in columns
    assert "expires_at" in columns

    # Verify Stage 3 columns in canary_tokens
    canary_cols = {col["name"]: col for col in inspector.get_columns("canary_tokens")}
    assert "recipient_name" in canary_cols
    assert "recipient_email" in canary_cols
    assert "organization" in canary_cols
    assert "tracking_note" in canary_cols
    assert "original_sha256" in canary_cols
    assert "watermarked_sha256" in canary_cols
    assert "status" in canary_cols
    assert "steganography_method" in canary_cols
    assert "revoked_at" in canary_cols

    # Verify Stage 3 columns in saved_workflows
    workflow_cols = {col["name"]: col for col in inspector.get_columns("saved_workflows")}
    assert "updated_at" in workflow_cols

    # 2. Reversible downgrade to 0002_add_stage2_cols (verifying 0003 rollback)
    command.downgrade(cfg, "0002_add_stage2_cols")
    engine.dispose()

    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    canary_cols_after_0002 = {col["name"]: col for col in inspector.get_columns("canary_tokens")}
    assert "recipient_name" not in canary_cols_after_0002
    assert "status" not in canary_cols_after_0002
    workflow_cols_after_0002 = {col["name"]: col for col in inspector.get_columns("saved_workflows")}
    assert "updated_at" not in workflow_cols_after_0002
    stage2_cols = {col["name"]: col for col in inspector.get_columns("pdf_jobs")}
    assert "output_file_size_bytes" in stage2_cols
    engine.dispose()

    # 3. Reversible downgrade to 0001_initial_stage1
    command.downgrade(cfg, "0001_initial_stage1")
    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    columns_after_downgrade = {col["name"]: col for col in inspector.get_columns("pdf_jobs")}
    assert "output_file_size_bytes" not in columns_after_downgrade
    assert "expires_at" not in columns_after_downgrade
    engine.dispose()

    # 4. Complete downgrade to base
    command.downgrade(cfg, "base")
    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    remaining_tables = inspector.get_table_names()
    assert "users" not in remaining_tables
    assert "pdf_jobs" not in remaining_tables
    engine.dispose()


def test_migration_idempotency_on_existing_tables(test_db_path):
    """
    Verifies that running upgrade on a database that already has Stage 1 tables
    does not overwrite or fail, but safely ensures Stage 2 columns are added.
    """
    cfg = get_alembic_config(test_db_path)

    # Upgrade to stage 1
    command.upgrade(cfg, "0001_initial_stage1")

    # Upgrade to head (should add stage 2 columns without error)
    command.upgrade(cfg, "head")

    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    columns = {col["name"]: col for col in inspector.get_columns("pdf_jobs")}
    assert "output_file_size_bytes" in columns
    assert "expires_at" in columns
    engine.dispose()

