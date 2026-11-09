import os
import uuid
import pytest
import fitz
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from app.models.workflow import SavedWorkflow
from app.models.document import PDFJob
from app.services.workflow_engine import (
    WorkflowEngineService,
    WorkflowExecutionError
)
from app.services.pdf_engine import PDFEngineService


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "workflow_test.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def test_user(db_session):
    user = User(
        id=uuid.uuid4(),
        cognito_sub="sub-wf-user-1111",
        email="workflow.creator@enterprise.com"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_user(db_session):
    user = User(
        id=uuid.uuid4(),
        cognito_sub="sub-wf-other-2222",
        email="unauthorized.guest@enterprise.com"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def sample_pdf_bytes():
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)  # Standard Letter
    page.insert_text((72, 72), "CONFIDENTIAL ASSET - RAW INPUT DOCUMENT")
    page.insert_text((72, 100), "Prepared for Automated Workflow Pipeline Execution")
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_workflow_step_validation():
    # 1. Empty steps
    with pytest.raises(HTTPException) as exc:
        WorkflowEngineService.validate_steps([])
    assert exc.value.status_code == 400

    # 2. Unsupported action
    with pytest.raises(HTTPException) as exc:
        WorkflowEngineService.validate_steps([{"action": "arbitrary_nonexistent_action"}])
    assert exc.value.status_code == 400
    assert "not supported" in exc.value.detail

    # 3. Invalid rotate angle
    with pytest.raises(HTTPException) as exc:
        WorkflowEngineService.validate_steps([{"action": "rotate", "params": {"angle": 45}}])
    assert exc.value.status_code == 400
    assert "angle must be 90, 180, or 270" in exc.value.detail

    # 4. Valid steps
    valid_steps = [
        {"action": "rotate", "params": {"angle": 90}},
        {"action": "watermark", "params": {"text": "CONFIDENTIAL", "opacity": 0.25}},
        {"action": "compress", "params": {"level": "high"}},
        {"action": "scrub_metadata", "params": {}}
    ]
    WorkflowEngineService.validate_steps(valid_steps)  # Should not raise


def test_workflow_database_crud(db_session, test_user, other_user):
    steps = [
        {"action": "rotate", "params": {"angle": 180}},
        {"action": "compress", "params": {"level": "medium"}}
    ]

    # Create
    wf = SavedWorkflow(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Quarterly Archival Blueprint",
        description="Rotates and compresses",
        steps=steps,
        is_favorite=True
    )
    db_session.add(wf)
    db_session.commit()
    db_session.refresh(wf)

    assert wf.id is not None
    assert wf.name == "Quarterly Archival Blueprint"
    assert len(wf.steps) == 2

    # Read
    fetched = db_session.query(SavedWorkflow).filter(SavedWorkflow.id == wf.id).first()
    assert fetched is not None
    assert fetched.user_id == test_user.id

    # User isolation: ensure other_user does not own it
    assert fetched.user_id != other_user.id

    # Update
    wf.name = "Updated Blueprint Name"
    wf.is_favorite = False
    db_session.commit()
    db_session.refresh(wf)
    assert wf.name == "Updated Blueprint Name"
    assert wf.is_favorite is False

    # Delete
    db_session.delete(wf)
    db_session.commit()
    assert db_session.query(SavedWorkflow).filter(SavedWorkflow.id == wf.id).first() is None


def test_workflow_sequential_execution_in_memory(sample_pdf_bytes, test_user):
    steps = [
        {"action": "rotate", "params": {"angle": 90}},
        {"action": "watermark", "params": {"text": "TOP SECRET", "opacity": 0.3}},
        {"action": "compress", "params": {"level": "medium"}},
        {"action": "scrub_metadata", "params": {}}
    ]

    final_bytes, step_results, out_name = WorkflowEngineService.execute_pipeline(
        file_bytes=sample_pdf_bytes,
        steps=steps,
        user=test_user,
        original_filename="financials.pdf"
    )

    assert final_bytes is not None
    assert len(final_bytes) > 0
    assert len(step_results) == 4

    # All steps completed
    for res in step_results:
        assert res.status == "COMPLETED"
        assert res.duration_ms >= 0

    # Verify PDF properties of final bytes
    doc = fitz.open(stream=final_bytes, filetype="pdf")
    assert len(doc) == 1
    # Verify rotation was applied (page 0 rotated 90)
    assert doc[0].rotation == 90
    doc.close()


def test_workflow_failure_stops_execution(sample_pdf_bytes, test_user):
    # Step 1: Rotate (succeeds)
    # Step 2: Protect with password "secret123" (succeeds)
    # Step 3: Unlock with invalid password (fails)
    # Step 4: Compress (should be SKIPPED)
    steps = [
        {"action": "rotate", "params": {"angle": 90}},
        {"action": "protect", "params": {"password": "secret123"}},
        {"action": "unlock", "params": {"password": "wrong_password"}},
        {"action": "compress", "params": {"level": "high"}}
    ]

    with pytest.raises(WorkflowExecutionError) as exc_info:
        WorkflowEngineService.execute_pipeline(
            file_bytes=sample_pdf_bytes,
            steps=steps,
            user=test_user,
            original_filename="input.pdf"
        )

    err = exc_info.value
    # Step 1 should be completed
    assert err.step_results[0].status == "COMPLETED"
    assert err.step_results[0].action == "rotate"

    # Step 2 should be completed
    assert err.step_results[1].status == "COMPLETED"
    assert err.step_results[1].action == "protect"

    # Step 3 should be failed
    assert err.step_index == 3
    assert err.action == "unlock"
    assert err.step_results[2].status == "FAILED"
    assert "Incorrect password" in err.step_results[2].error_message or "Unable to unlock" in err.step_results[2].error_message

    # Step 4 should be skipped
    assert err.step_results[3].status == "SKIPPED"
    assert err.step_results[3].action == "compress"
