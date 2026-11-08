import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.models.user import User
from app.models.document import PDFJob
from app.schemas.document import PDFJobRead
from app.services.job_service import resolve_caller_identity, verify_job_access, job_service

logger = logging.getLogger("cloudpdf.api.history")
router = APIRouter(prefix="/history", tags=["Processing History"])


@router.get("", response_model=List[PDFJobRead], summary="List Processing History")
def list_history_endpoint(
    limit: int = 50,
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
        return []

    jobs = query.order_by(PDFJob.created_at.desc()).limit(limit).all()

    results = []
    for j in jobs:
        d_url = job_service.get_download_url_or_fallback(j, output=bool(j.s3_output_key))
        read_item = PDFJobRead.model_validate(j)
        read_item.download_url = d_url
        results.append(read_item)

    return results


@router.get("/{job_id}", response_model=PDFJobRead, summary="Get Processing Job Status")
def get_job_history_endpoint(
    job_id: uuid.UUID,
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    job = db.query(PDFJob).filter(PDFJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found.")

    verify_job_access(job, user=user, session_id=x_guest_session_id)
    d_url = job_service.get_download_url_or_fallback(job, output=bool(job.s3_output_key))

    read_item = PDFJobRead.model_validate(job)
    read_item.download_url = d_url
    return read_item

