import os
import json
import uuid
import logging
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    HTTPException,
    status
)
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_optional_user
from app.models.user import User
from app.models.workflow import SavedWorkflow
from app.models.document import PDFJob
from app.schemas.workflow import (
    SavedWorkflowCreate,
    SavedWorkflowRead,
    SavedWorkflowUpdate,
    WorkflowExecutionResponse,
    WorkflowStepExecution
)
from app.services.workflow_engine import (
    WorkflowEngineService,
    WorkflowExecutionError,
    workflow_engine
)
from app.services.file_validator import sanitize_filename
from app.services.storage import storage_service
from app.services.job_service import job_service

logger = logging.getLogger("cloudpdf.api.workflows")
router = APIRouter(prefix="/workflows", tags=["Automated Workflow Studio"])


@router.get("", response_model=List[SavedWorkflowRead], summary="List Saved Workflows")
async def list_workflows_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists all reusable PDF workflow blueprints owned by the authenticated member."""
    workflows = (
        db.query(SavedWorkflow)
        .filter(SavedWorkflow.user_id == user.id)
        .order_by(SavedWorkflow.created_at.desc())
        .all()
    )
    return workflows


@router.post("", response_model=SavedWorkflowRead, summary="Save Workflow Blueprint")
async def create_workflow_endpoint(
    payload: SavedWorkflowCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Creates and persists a new multi-step automated processing blueprint in PostgreSQL."""
    WorkflowEngineService.validate_steps(payload.steps)

    workflow = SavedWorkflow(
        id=uuid.uuid4(),
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        steps=payload.steps,
        is_favorite=payload.is_favorite
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@router.get("/{workflow_id}", response_model=SavedWorkflowRead, summary="Get Workflow Blueprint")
async def get_workflow_endpoint(
    workflow_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves a specific workflow blueprint by ID."""
    workflow = db.query(SavedWorkflow).filter(SavedWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    if workflow.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this workflow."
        )

    return workflow


@router.put("/{workflow_id}", response_model=SavedWorkflowRead, summary="Update Workflow Blueprint")
async def update_workflow_endpoint(
    workflow_id: uuid.UUID,
    payload: SavedWorkflowUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates an existing workflow blueprint."""
    workflow = db.query(SavedWorkflow).filter(SavedWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    if workflow.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this workflow."
        )

    if payload.steps is not None:
        WorkflowEngineService.validate_steps(payload.steps)
        workflow.steps = payload.steps

    if payload.name is not None:
        workflow.name = payload.name.strip()

    if payload.description is not None:
        workflow.description = payload.description.strip() if payload.description else None

    if payload.is_favorite is not None:
        workflow.is_favorite = payload.is_favorite

    db.commit()
    db.refresh(workflow)
    return workflow


@router.delete("/{workflow_id}", summary="Delete Workflow Blueprint")
async def delete_workflow_endpoint(
    workflow_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permanently removes a saved workflow blueprint."""
    workflow = db.query(SavedWorkflow).filter(SavedWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    if workflow.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this workflow."
        )

    db.delete(workflow)
    db.commit()
    return {"detail": "Workflow successfully deleted."}


@router.post("/run", response_model=WorkflowExecutionResponse, summary="Execute Pipeline")
async def run_workflow_endpoint(
    file: UploadFile = File(...),
    workflow_id: Optional[str] = Form(None),
    steps: Optional[str] = Form(None),
    workflow_name: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes a multi-step PDF pipeline sequentially in-memory.
    Accepts either a saved workflow_id or an ad-hoc JSON array of steps.
    """
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded document is empty."
        )

    filename = sanitize_filename(file.filename or "input.pdf")
    parsed_steps: List[dict] = []
    w_name = workflow_name or "Custom Pipeline"
    w_uuid = None

    if workflow_id:
        try:
            w_uuid = uuid.UUID(workflow_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid workflow ID format.")

        saved = db.query(SavedWorkflow).filter(SavedWorkflow.id == w_uuid).first()
        if not saved:
            raise HTTPException(status_code=404, detail="Saved workflow not found.")
        if saved.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden access to workflow.")

        parsed_steps = saved.steps
        w_name = saved.name
    elif steps:
        try:
            parsed_steps = json.loads(steps)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid steps JSON: {str(e)}")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'workflow_id' or 'steps' JSON must be provided."
        )

    WorkflowEngineService.validate_steps(parsed_steps)

    # Storage paths
    run_token = uuid.uuid4().hex[:8]
    output_filename = f"pipeline_{run_token}_{filename}"
    raw_key = storage_service.build_user_raw_key(user.cognito_sub, f"pipe_in_{run_token}_{filename}")
    proc_key = storage_service.build_user_processed_key(user.cognito_sub, output_filename)

    # Save initial input in S3
    storage_service.upload_file(content, raw_key, "application/pdf")

    # Record job
    job = job_service.create_pending_job(
        db=db,
        action_type="PIPELINE",
        original_filename=filename,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user.id,
        session_id=None
    )
    job.is_pipeline = True
    db.commit()

    try:
        final_bytes, step_results, _ = WorkflowEngineService.execute_pipeline(
            file_bytes=content,
            steps=parsed_steps,
            user=user,
            original_filename=filename,
            db=db
        )

        # Upload final output to S3
        storage_service.upload_file(final_bytes, proc_key, "application/pdf")

        # Complete job
        job_service.complete_job(db, job, proc_key, len(final_bytes), "application/pdf")
        job.pipeline_steps = [sr.model_dump() for sr in step_results]
        db.commit()

        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return WorkflowExecutionResponse(
            job_id=job.id,
            workflow_id=w_uuid,
            workflow_name=w_name,
            status="COMPLETED",
            total_steps=len(parsed_steps),
            completed_steps=len([sr for sr in step_results if sr.status == "COMPLETED"]),
            step_results=step_results,
            download_url=download_url,
            output_filename=output_filename,
            output_size_bytes=len(final_bytes),
            created_at=job.created_at
        )

    except WorkflowExecutionError as exec_err:
        job.status = "FAILED"
        job.error_message = exec_err.message
        job.pipeline_steps = [sr.model_dump() for sr in exec_err.step_results]
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": f"Pipeline halted at Step {exec_err.step_index} ({exec_err.action}): {exec_err.message}",
                "job_id": str(job.id),
                "failed_step_index": exec_err.step_index,
                "step_results": [sr.model_dump() for sr in exec_err.step_results]
            }
        )

    except Exception as general_err:
        job_service.fail_job(db, job, str(general_err))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline orchestrator execution failure: {str(general_err)}"
        )


@router.get("/executions/{execution_id}", response_model=WorkflowExecutionResponse, summary="Get Execution Status")
async def get_execution_endpoint(
    execution_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves execution history and telemetry for a specific pipeline execution job."""
    job = db.query(PDFJob).filter(PDFJob.id == execution_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Execution job not found.")

    if job.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden access to execution record.")

    step_results = []
    if job.pipeline_steps and isinstance(job.pipeline_steps, list):
        for s in job.pipeline_steps:
            step_results.append(WorkflowStepExecution(**s))

    download_url = None
    if job.s3_output_key and job.status == "COMPLETED":
        download_url = job_service.get_download_url_or_fallback(job, output=True)

    completed_count = len([s for s in step_results if s.status == "COMPLETED"])

    return WorkflowExecutionResponse(
        job_id=job.id,
        workflow_id=None,
        workflow_name=job.original_filename or "Document Pipeline",
        status=job.status,
        total_steps=len(step_results),
        completed_steps=completed_count,
        step_results=step_results,
        download_url=download_url,
        output_filename=os.path.basename(job.s3_output_key) if job.s3_output_key else None,
        output_size_bytes=job.output_file_size_bytes,
        created_at=job.created_at
    )

