import uuid
from datetime import datetime
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, ConfigDict, Field


class WorkflowStepConfig(BaseModel):
    action: str = Field(..., description="Action type: rotate, watermark, compress, protect, unlock, ocr, canary_watermark, etc.")
    params: Dict[str, Any] = Field(default_factory=dict, description="Step parameters")


class SavedWorkflowBase(BaseModel):
    name: str = Field(..., max_length=128)
    description: Optional[str] = Field(None, max_length=255)
    steps: List[Dict[str, Any]]
    is_favorite: bool = False


class SavedWorkflowCreate(SavedWorkflowBase):
    pass


class SavedWorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    description: Optional[str] = Field(None, max_length=255)
    steps: Optional[List[Dict[str, Any]]] = None
    is_favorite: Optional[bool] = None


class SavedWorkflowRead(SavedWorkflowBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowStepExecution(BaseModel):
    step_index: int
    action: str
    status: str  # "COMPLETED", "FAILED", "SKIPPED"
    duration_ms: Optional[float] = None
    error_message: Optional[str] = None


class WorkflowExecutionResponse(BaseModel):
    job_id: uuid.UUID
    workflow_id: Optional[uuid.UUID] = None
    workflow_name: str
    status: str  # "COMPLETED", "FAILED"
    total_steps: int
    completed_steps: int
    step_results: List[WorkflowStepExecution]
    download_url: Optional[str] = None
    output_filename: Optional[str] = None
    output_size_bytes: Optional[int] = None
    created_at: datetime
