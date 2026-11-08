import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, Header, Request

from app.core.config import config
from app.models.user import User
from app.models.document import PDFJob
from app.services.storage import storage_service

logger = logging.getLogger("cloudpdf.job_service")


def resolve_caller_identity(
    user: Optional[User],
    x_guest_session_id: Optional[str] = None
) -> Tuple[Optional[uuid.UUID], Optional[str], Optional[str]]:
    """
    Resolves the authenticated user or guest session.
    Returns (user_id, cognito_sub, session_id).
    If guest session_id is invalid or missing, generates a new secure UUID.
    """
    if user:
        return user.id, user.cognito_sub, None

    # Guest mode
    session_id = x_guest_session_id
    if session_id:
        # Validate UUID format
        try:
            uuid.UUID(session_id)
        except (ValueError, AttributeError):
            session_id = str(uuid.uuid4())
    else:
        session_id = str(uuid.uuid4())

    return None, None, session_id


def verify_job_access(
    job: PDFJob,
    user: Optional[User] = None,
    session_id: Optional[str] = None
) -> None:
    """
    Verifies that the caller owns the job.
    Enforces 24-hour expiration for guest jobs.
    """
    # Expiration check
    if job.expires_at:
        now = datetime.now(timezone.utc)
        if now > job.expires_at.replace(tzinfo=timezone.utc) if job.expires_at.tzinfo is None else now > job.expires_at:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This guest session document has expired under the 24-hour retention policy."
            )

    if user:
        if job.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not own this document record."
            )
        return

    if session_id:
        if job.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Session ownership mismatch for requested document."
            )
        return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication or valid guest session required."
    )


class JobService:
    @staticmethod
    def create_pending_job(
        db: Session,
        action_type: str,
        original_filename: str,
        file_size_bytes: int,
        s3_input_key: str,
        user_id: Optional[uuid.UUID] = None,
        session_id: Optional[str] = None,
        mime_type: str = "application/pdf"
    ) -> PDFJob:
        expires_at = None
        if not user_id and session_id:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=config.GUEST_RETENTION_HOURS)

        job = PDFJob(
            user_id=user_id,
            session_id=session_id,
            action_type=action_type,
            original_filename=original_filename,
            s3_input_key=s3_input_key,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            status="PROCESSING",
            expires_at=expires_at,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def complete_job(
        db: Session,
        job: PDFJob,
        s3_output_key: str,
        output_file_size_bytes: int,
        output_mime_type: str = "application/pdf"
    ) -> PDFJob:
        job.s3_output_key = s3_output_key
        job.output_file_size_bytes = output_file_size_bytes
        job.output_mime_type = output_mime_type
        job.status = "COMPLETED"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)

        # Update member storage quota if authenticated
        if job.user_id:
            user = db.query(User).filter(User.id == job.user_id).first()
            if user:
                user.storage_used_bytes += (job.file_size_bytes + output_file_size_bytes)
                db.commit()

        return job

    @staticmethod
    def fail_job(
        db: Session,
        job: PDFJob,
        error_message: str
    ) -> PDFJob:
        job.status = "FAILED"
        job.error_message = error_message
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def get_download_url_or_fallback(job: PDFJob, output: bool = True) -> Optional[str]:
        key = job.s3_output_key if output else job.s3_input_key
        if not key:
            return None
        download_name = job.original_filename
        if output and job.s3_output_key:
            import os
            download_name = os.path.basename(job.s3_output_key)

        presigned = storage_service.generate_presigned_url(key, download_filename=download_name)
        if presigned:
            return presigned
        # Fallback to backend download proxy route
        return f"/api/v1/files/{job.id}/download"


job_service = JobService()

