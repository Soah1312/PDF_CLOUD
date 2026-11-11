import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class OCRInspectResponse(BaseModel):
    filename: str
    page_count: int
    file_size_bytes: int
    has_digital_text: bool
    detected_words: int
    pages_with_text: int
    message: str
    recommended_action: str  # "OCR_RECOMMENDED" or "SEARCHABLE_ALREADY"


class OCRJobCreateResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    processing_stage: str
    progress: int
    has_digital_text: bool
    page_count: int
    message: str
    guest_session_id: Optional[str] = None


class OCRJobStatusResponse(BaseModel):
    job_id: uuid.UUID
    original_filename: str
    page_count: int
    file_size_bytes: int
    output_file_size_bytes: Optional[int] = None
    status: str
    processing_stage: str
    progress: int
    has_digital_text: bool
    force_ocr: bool
    detected_words: int
    ocr_engine: str = "ocrmypdf"
    language: str = "eng"
    error_message: Optional[str] = None
    is_completed: bool
    download_url: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
