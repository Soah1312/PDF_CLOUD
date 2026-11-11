import io
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.models.ocr import OCRJob
from app.models.user import User
from app.schemas.ocr import (
    OCRInspectResponse,
    OCRJobCreateResponse,
    OCRJobStatusResponse,
)
from app.services.file_validator import (
    sanitize_filename,
    validate_file_signature,
    validate_pdf_content,
    MAX_FILE_SIZE_BYTES_GUEST,
    MAX_FILE_SIZE_BYTES_MEMBER,
    MAX_PAGE_COUNT_GUEST,
    MAX_PAGE_COUNT_MEMBER,
)
from app.services.ocr_service import inspect_pdf_digital_text, ocr_processor
from app.services.storage import storage_service

logger = logging.getLogger("cloudpdf.api.ocr")
router = APIRouter(prefix="/ocr", tags=["OCR Studio"])


def _verify_ocr_job_ownership(
    job: OCRJob,
    user: Optional[User],
    session_id: Optional[str]
):
    """
    Strict tenant and session isolation check.
    Prevents guests or authenticated users from accessing another user's jobs.
    """
    if job.user_id is not None:
        if not user or user.id != job.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have permission to access this OCR job."
            )
    else:
        # Guest job
        if not session_id or job.guest_session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Invalid guest session identifier for this OCR job."
            )

    # Check 24-hour expiration for guest jobs
    if job.expires_at:
        now_utc = datetime.now(timezone.utc)
        exp = job.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now_utc > exp:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This guest OCR document has expired according to the 24-hour retention policy."
            )


@router.post("/inspect", response_model=OCRInspectResponse, summary="Inspect PDF for Existing Digital Text")
async def inspect_pdf(
    file: UploadFile = File(...),
    user: Optional[User] = Depends(get_optional_user),
):
    """
    Pre-flight document inspection.
    Checks whether a PDF already contains embedded searchable text before invoking
    Amazon Textract, protecting users from unnecessary cloud processing costs.
    """
    content = await file.read()
    if not validate_file_signature(content, "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF document."
        )

    max_size = MAX_FILE_SIZE_BYTES_MEMBER if user else MAX_FILE_SIZE_BYTES_GUEST
    max_pages = MAX_PAGE_COUNT_MEMBER if user else MAX_PAGE_COUNT_GUEST
    num_pages, _ = validate_pdf_content(content, file.filename, max_size, max_pages)

    inspection = inspect_pdf_digital_text(content)
    inspection["filename"] = file.filename
    inspection["file_size_bytes"] = len(content)
    inspection["page_count"] = num_pages
    return inspection


@router.post("/searchable", summary="Create Searchable PDF via Amazon Textract")
async def create_searchable_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    force_ocr: bool = Form(False),
    user: Optional[User] = Depends(get_optional_user),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_guest_session_id: Optional[str] = Header(None, alias="X-Guest-Session-ID"),
    db: Session = Depends(get_db),
):
    session_id = x_session_id or x_guest_session_id
    """
    Submits a PDF for OCR processing using Amazon Textract in ap-south-1.
    If the document already contains selectable digital text and force_ocr is False,
    returns an advisory response allowing the user to confirm before incurring cloud fees.
    Otherwise, enqueues the job and starts asynchronous pipeline processing.
    """
    content = await file.read()
    filename = sanitize_filename(file.filename or "document.pdf")

    # 1. Validate file signature and content limits
    if not validate_file_signature(content, "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file signature: File must be a valid PDF."
        )

    max_size = MAX_FILE_SIZE_BYTES_MEMBER if user else MAX_FILE_SIZE_BYTES_GUEST
    max_pages = MAX_PAGE_COUNT_MEMBER if user else MAX_PAGE_COUNT_GUEST
    num_pages, is_encrypted = validate_pdf_content(content, filename, max_size, max_pages)

    if is_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password-protected encrypted PDFs cannot be processed by OCR. Please decrypt the document first."
        )

    # 2. Check for existing digital text
    inspection = inspect_pdf_digital_text(content)
    has_digital_text = inspection["has_digital_text"]

    if has_digital_text and not force_ocr:
        # Prompt user for confirmation to avoid accidental Textract charges
        return {
            "job_id": None,
            "status": "REQUIRES_CONFIRMATION",
            "processing_stage": "INSPECTED",
            "progress": 0,
            "has_digital_text": True,
            "detected_words": inspection["detected_words"],
            "page_count": num_pages,
            "message": (
                f"This PDF already appears to contain searchable text ({inspection['detected_words']} words detected). "
                "To force full OCR re-scanning with Amazon Textract, enable the 'Force OCR' option."
            ),
        }

    # 3. Create database job record
    job_id = uuid.uuid4()
    guest_session = None

    if user:
        raw_s3_key = storage_service.build_user_raw_key(user.cognito_sub, f"{job_id}_{filename}")
        processed_s3_key = storage_service.build_user_processed_key(user.cognito_sub, f"{job_id}_searchable_{filename}")
        expires_at = None
    else:
        guest_session = session_id or f"guest-{uuid.uuid4().hex[:16]}"
        raw_s3_key = storage_service.build_guest_raw_key(guest_session, f"{job_id}_{filename}")
        processed_s3_key = storage_service.build_guest_processed_key(guest_session, f"{job_id}_searchable_{filename}")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    ocr_job = OCRJob(
        id=job_id,
        user_id=user.id if user else None,
        guest_session_id=guest_session,
        original_filename=filename,
        original_s3_key=raw_s3_key,
        output_s3_key=processed_s3_key,
        page_count=num_pages,
        file_size_bytes=len(content),
        status="PENDING",
        processing_stage="QUEUED",
        progress=5,
        has_digital_text=has_digital_text,
        force_ocr=force_ocr,
        detected_words=inspection["detected_words"],
        expires_at=expires_at,
    )
    db.add(ocr_job)
    db.commit()
    db.refresh(ocr_job)

    # 4. Trigger background OCR processing
    background_tasks.add_task(ocr_processor.process_job, job_id, content)

    return OCRJobCreateResponse(
        job_id=ocr_job.id,
        status=ocr_job.status,
        processing_stage=ocr_job.processing_stage,
        progress=ocr_job.progress,
        has_digital_text=has_digital_text,
        page_count=num_pages,
        message="OCR job successfully queued for Amazon Textract processing.",
    )


@router.get("/jobs/{job_id}", response_model=OCRJobStatusResponse, summary="Get OCR Job Status")
def get_ocr_job_status(
    job_id: uuid.UUID,
    user: Optional[User] = Depends(get_optional_user),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_guest_session_id: Optional[str] = Header(None, alias="X-Guest-Session-ID"),
    db: Session = Depends(get_db),
):
    """
    Returns live processing status, active stage, progress percentage,
    and download information for an OCR job.
    """
    session_id = x_session_id or x_guest_session_id
    job = db.query(OCRJob).filter(OCRJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OCR job '{job_id}' not found."
        )

    _verify_ocr_job_ownership(job, user, session_id)

    download_url = None
    if job.status == "COMPLETED":
        download_url = f"/api/v1/ocr/jobs/{job.id}/download"

    return OCRJobStatusResponse(
        job_id=job.id,
        original_filename=job.original_filename,
        page_count=job.page_count,
        file_size_bytes=job.file_size_bytes,
        output_file_size_bytes=job.output_file_size_bytes,
        status=job.status,
        processing_stage=job.processing_stage,
        progress=job.progress,
        has_digital_text=job.has_digital_text,
        force_ocr=job.force_ocr,
        detected_words=job.detected_words,
        error_message=job.error_message,
        is_completed=(job.status == "COMPLETED"),
        download_url=download_url,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


@router.get("/jobs/{job_id}/download", summary="Download Searchable OCR PDF")
def download_searchable_pdf(
    job_id: uuid.UUID,
    user: Optional[User] = Depends(get_optional_user),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_guest_session_id: Optional[str] = Header(None, alias="X-Guest-Session-ID"),
    db: Session = Depends(get_db),
):
    """
    Downloads the completed searchable PDF with appropriate Content-Disposition headers.
    Ensures strict tenant ownership and validates 24-hour expiration for guest jobs.
    """
    session_id = x_session_id or x_guest_session_id
    job = db.query(OCRJob).filter(OCRJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OCR job '{job_id}' not found."
        )

    _verify_ocr_job_ownership(job, user, session_id)

    if job.status != "COMPLETED" or not job.output_s3_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OCR job is in '{job.status}' state and not ready for download."
        )

    try:
        file_bytes = storage_service.download_file(job.output_s3_key)
    except Exception as e:
        logger.error(f"[OCR] Failed to download output key '{job.output_s3_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve completed searchable PDF from storage."
        )

    download_filename = f"searchable_{job.original_filename}"
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{download_filename}"',
            "X-Page-Count": str(job.page_count),
        },
    )


@router.get("/jobs", summary="List OCR Jobs")
def list_ocr_jobs(
    user: Optional[User] = Depends(get_optional_user),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_guest_session_id: Optional[str] = Header(None, alias="X-Guest-Session-ID"),
    db: Session = Depends(get_db),
):
    """
    Lists recent OCR jobs for the authenticated member or active guest session.
    """
    session_id = x_session_id or x_guest_session_id
    if user:
        jobs = (
            db.query(OCRJob)
            .filter(OCRJob.user_id == user.id)
            .order_by(OCRJob.created_at.desc())
            .limit(20)
            .all()
        )
    elif session_id:
        jobs = (
            db.query(OCRJob)
            .filter(OCRJob.guest_session_id == session_id)
            .order_by(OCRJob.created_at.desc())
            .limit(20)
            .all()
        )
    else:
        return []

    return [
        {
            "job_id": str(j.id),
            "filename": j.original_filename,
            "page_count": j.page_count,
            "status": j.status,
            "stage": j.processing_stage,
            "progress": j.progress,
            "created_at": j.created_at.isoformat(),
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "download_url": f"/api/v1/ocr/jobs/{j.id}/download" if j.status == "COMPLETED" else None,
        }
        for j in jobs
    ]
