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

    # 2. Reversible downgrade to 0001_initial_stage1
    command.downgrade(cfg, "0001_initial_stage1")
    engine.dispose()

    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    columns_after_downgrade = {col["name"]: col for col in inspector.get_columns("pdf_jobs")}
    assert "output_file_size_bytes" not in columns_after_downgrade
    assert "expires_at" not in columns_after_downgrade

    # 3. Complete downgrade to base
    command.downgrade(cfg, "base")
    engine.dispose()

    engine = create_engine(f"sqlite:///{test_db_path}")
    inspector = inspect(engine)
    remaining_tables = inspector.get_table_names()
    assert "users" not in remaining_tables
    assert "pdf_jobs" not in remaining_tables


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

