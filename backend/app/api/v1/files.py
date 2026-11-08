import uuid
import logging
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Header,
    Response,
    HTTPException,
    status
)
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user, get_current_user
from app.models.user import User
from app.models.document import PDFJob
from app.schemas.document import FileItem, FileListResponse
from app.services.file_validator import sanitize_filename
from app.services.storage import storage_service
from app.services.job_service import resolve_caller_identity, verify_job_access, job_service

logger = logging.getLogger("cloudpdf.api.files")
router = APIRouter(prefix="/files", tags=["File Management"])


@router.post("/upload", response_model=FileItem, summary="Upload Document")
async def upload_file_endpoint(
    response: Response,
    file: UploadFile = File(...),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    filename = sanitize_filename(file.filename or "uploaded_file.pdf")
    content_type = file.content_type or "application/pdf"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, filename)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, filename)

    storage_service.upload_file(content, raw_key, content_type)

    job = job_service.create_pending_job(
        db=db,
        action_type="UPLOAD",
        original_filename=filename,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id,
        mime_type=content_type
    )
    job.status = "COMPLETED"
    job.s3_output_key = raw_key
    job.output_file_size_bytes = len(content)
    db.commit()

    if user:
        user.storage_used_bytes += len(content)
        db.commit()

    download_url = job_service.get_download_url_or_fallback(job, output=False)

    return FileItem(
        id=job.id,
        original_filename=job.original_filename,
        action_type=job.action_type,
        file_size_bytes=job.file_size_bytes,
        output_file_size_bytes=job.output_file_size_bytes,
        status=job.status,
        created_at=job.created_at,
        download_url=download_url,
        is_guest=bool(session_id),
        expires_at=job.expires_at
    )


@router.get("", response_model=FileListResponse, summary="List User Documents")
def list_files_endpoint(
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)

    query = db.query(PDFJob)
    if user_id:
        query = query.filter(PDFJob.user_id == user_id)
    elif session_id:
        query = query.filter(PDFJob.session_id == session_id)
    else:
        return FileListResponse(files=[], total_count=0, storage_used_bytes=0)

    jobs = query.order_by(PDFJob.created_at.desc()).all()
    file_items = []
    total_storage = 0

    for j in jobs:
        total_storage += (j.file_size_bytes + (j.output_file_size_bytes or 0))
        d_url = job_service.get_download_url_or_fallback(j, output=bool(j.s3_output_key))
        file_items.append(
            FileItem(
                id=j.id,
                original_filename=j.original_filename,
                action_type=j.action_type,
                file_size_bytes=j.file_size_bytes,
                output_file_size_bytes=j.output_file_size_bytes,
                status=j.status,
                created_at=j.created_at,
                download_url=d_url,
                is_guest=bool(j.session_id),
                expires_at=j.expires_at
            )
        )

    return FileListResponse(
        files=file_items,
        total_count=len(file_items),
        storage_used_bytes=user.storage_used_bytes if user else total_storage
    )


@router.get("/{file_id}", response_model=FileItem, summary="Get Document Details")
def get_file_endpoint(
    file_id: uuid.UUID,
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    job = db.query(PDFJob).filter(PDFJob.id == file_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Document record not found.")

    verify_job_access(job, user=user, session_id=x_guest_session_id)
    d_url = job_service.get_download_url_or_fallback(job, output=bool(job.s3_output_key))

    return FileItem(
        id=job.id,
        original_filename=job.original_filename,
        action_type=job.action_type,
        file_size_bytes=job.file_size_bytes,
        output_file_size_bytes=job.output_file_size_bytes,
        status=job.status,
        created_at=job.created_at,
        download_url=d_url,
        is_guest=bool(job.session_id),
        expires_at=job.expires_at
    )


@router.get("/{file_id}/download", summary="Download Document")
def download_file_endpoint(
    file_id: uuid.UUID,
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    job = db.query(PDFJob).filter(PDFJob.id == file_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Document not found.")

    verify_job_access(job, user=user, session_id=x_guest_session_id)

    target_key = job.s3_output_key or job.s3_input_key
    if not target_key:
        raise HTTPException(status_code=404, detail="No stored document object exists for this record.")

    # Try presigned S3 redirect if available
    presigned = storage_service.generate_presigned_url(target_key, download_filename=job.original_filename)
    if presigned:
        return RedirectResponse(url=presigned)

    # Download from S3 / local mirror and stream directly
    data = storage_service.download_file(target_key)
    mime = job.output_mime_type or job.mime_type or "application/pdf"
    import io
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{sanitize_filename(job.original_filename)}"'}
    )


@router.delete("/{file_id}", summary="Delete Document")
def delete_file_endpoint(
    file_id: uuid.UUID,
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    job = db.query(PDFJob).filter(PDFJob.id == file_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Document not found.")

    verify_job_access(job, user=user, session_id=x_guest_session_id)

    # Delete storage objects
    if job.s3_input_key:
        storage_service.delete_file(job.s3_input_key)
    if job.s3_output_key and job.s3_output_key != job.s3_input_key:
        storage_service.delete_file(job.s3_output_key)

    # Reclaim user storage quota
    if user and job.user_id == user.id:
        reclaimed = job.file_size_bytes + (job.output_file_size_bytes or 0)
        user.storage_used_bytes = max(0, user.storage_used_bytes - reclaimed)

    db.delete(job)
    db.commit()

    return {"message": "Document deleted successfully.", "id": str(file_id)}

