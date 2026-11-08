import uuid
from datetime import datetime
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, ConfigDict


class PDFJobBase(BaseModel):
    action_type: str
    original_filename: str
    is_pipeline: bool = False
    pipeline_steps: Optional[List[Dict[str, Any]]] = None


class PDFJobCreate(PDFJobBase):
    session_id: Optional[str] = None
    s3_input_key: str
    file_size_bytes: int = 0
    mime_type: Optional[str] = "application/pdf"
    expires_at: Optional[datetime] = None


class PDFJobRead(PDFJobBase):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    session_id: Optional[str] = None
    s3_input_key: str
    s3_output_key: Optional[str] = None
    file_size_bytes: int
    output_file_size_bytes: Optional[int] = 0
    mime_type: Optional[str] = "application/pdf"
    output_mime_type: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    download_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PDFProcessResponse(BaseModel):
    job_id: uuid.UUID
    action_type: str
    status: str
    original_filename: str
    output_filename: str
    file_size_bytes: int
    output_file_size_bytes: int
    download_url: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    stats: Optional[Dict[str, Any]] = None


class FileItem(BaseModel):
    id: uuid.UUID
    original_filename: str
    action_type: str
    file_size_bytes: int
    output_file_size_bytes: Optional[int] = None
    status: str
    created_at: datetime
    download_url: Optional[str] = None
    is_guest: bool = False
    expires_at: Optional[datetime] = None


class FileListResponse(BaseModel):
    files: List[FileItem]
    total_count: int
    storage_used_bytes: int


class CanaryTokenRead(BaseModel):
    token_id: str
    user_id: uuid.UUID
    job_id: uuid.UUID
    download_ip: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
