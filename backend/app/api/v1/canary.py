import os
import uuid
import logging
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    Request,
    HTTPException,
    status
)
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_optional_user
from app.models.user import User
from app.models.document import CanaryToken, PDFJob
from app.schemas.canary import (
    CanaryTokenRead,
    CanaryVerificationResponse,
    CanaryRevokeResponse
)
from app.services.canary_service import CanaryService
from app.services.file_validator import sanitize_filename
from app.services.storage import storage_service
from app.services.job_service import job_service

logger = logging.getLogger("cloudpdf.api.canary")
router = APIRouter(prefix="/canary", tags=["Invisible Canary Watermark"])


@router.post("/embed", response_model=CanaryTokenRead, summary="Embed Invisible Canary Watermark")
async def embed_canary_endpoint(
    request: Request,
    file: UploadFile = File(...),
    recipient_name: Optional[str] = Form(None),
    recipient_email: Optional[str] = Form(None),
    organization: Optional[str] = Form(None),
    tracking_note: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authenticated member endpoint to embed an invisible forensic canary watermark.
    Generates a cryptographically unique token, marks the PDF across multiple layers,
    records provenance in PostgreSQL, and uploads an immutable forensic ledger to S3.
    """
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    filename = sanitize_filename(file.filename or "confidential.pdf")
    base_name = os.path.splitext(filename)[0]
    output_filename = f"protected_{base_name}_canary.pdf"

    token_id = CanaryService.generate_token_id()
    client_ip = request.client.host if request.client else None

    # Storage paths
    raw_key = storage_service.build_user_raw_key(user.cognito_sub, f"src_{token_id}_{filename}")
    proc_key = storage_service.build_user_processed_key(user.cognito_sub, output_filename)

    # Save original raw in S3
    storage_service.upload_file(content, raw_key, "application/pdf")

    # Create pending job
    job = job_service.create_pending_job(
        db=db,
        action_type="CANARY_WATERMARK",
        original_filename=filename,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user.id,
        session_id=None
    )

    try:
        # Embed watermark
        watermarked_bytes, orig_sha256, wm_sha256 = CanaryService.embed_watermark(
            file_bytes=content,
            token_id=token_id,
            recipient_metadata={
                "recipient_name": recipient_name,
                "recipient_email": recipient_email,
                "organization": organization,
                "tracking_note": tracking_note
            },
            original_filename=filename
        )

        # Upload watermarked file to S3
        storage_service.upload_file(watermarked_bytes, proc_key, "application/pdf")

        # Complete job
        job_service.complete_job(db, job, proc_key, len(watermarked_bytes), "application/pdf")

        # Persist CanaryToken in DB and upload S3 forensic manifest
        token_record = CanaryService.create_and_store_ledger(
            db=db,
            user=user,
            job=job,
            token_id=token_id,
            original_sha256=orig_sha256,
            watermarked_sha256=wm_sha256,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            organization=organization,
            tracking_note=tracking_note,
            download_ip=client_ip
        )

        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return CanaryTokenRead(
            token_id=token_record.token_id,
            user_id=token_record.user_id,
            job_id=token_record.job_id,
            recipient_name=token_record.recipient_name,
            recipient_email=token_record.recipient_email,
            organization=token_record.organization,
            tracking_note=token_record.tracking_note,
            original_sha256=token_record.original_sha256,
            watermarked_sha256=token_record.watermarked_sha256,
            steganography_method=token_record.steganography_method,
            status=token_record.status,
            created_at=token_record.created_at,
            revoked_at=token_record.revoked_at,
            download_ip=token_record.download_ip,
            download_url=download_url
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"[Canary] Watermark generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forensic canary watermarking failed: {str(e)}"
        )


@router.post("/verify", response_model=CanaryVerificationResponse, summary="Verify Forensic Document")
async def verify_canary_endpoint(
    file: UploadFile = File(...),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Forensic leak verifier endpoint.
    Scans an uploaded PDF for invisible forensic markers across content streams,
    document metadata, and catalog structures. Returns attribution ledger according
    to caller authorization.
    """
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    filename = sanitize_filename(file.filename or "suspect.pdf")
    return CanaryService.verify_document(
        file_bytes=content,
        db=db,
        current_user=user,
        filename=filename
    )


@router.get("/tokens", response_model=List[CanaryTokenRead], summary="List Canary Tokens")
async def list_canary_tokens_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists all active and revoked canary tokens generated by the authenticated member."""
    tokens = (
        db.query(CanaryToken)
        .filter(CanaryToken.user_id == user.id)
        .order_by(CanaryToken.created_at.desc())
        .all()
    )

    results = []
    for t in tokens:
        d_url = None
        if t.job and t.job.s3_output_key:
            d_url = job_service.get_download_url_or_fallback(t.job, output=True)

        results.append(
            CanaryTokenRead(
                token_id=t.token_id,
                user_id=t.user_id,
                job_id=t.job_id,
                recipient_name=t.recipient_name,
                recipient_email=t.recipient_email,
                organization=t.organization,
                tracking_note=t.tracking_note,
                original_sha256=t.original_sha256,
                watermarked_sha256=t.watermarked_sha256,
                steganography_method=t.steganography_method,
                status=t.status,
                created_at=t.created_at,
                revoked_at=t.revoked_at,
                download_ip=t.download_ip,
                download_url=d_url
            )
        )
    return results


@router.get("/tokens/{token_id}", response_model=CanaryTokenRead, summary="Get Canary Token Details")
async def get_canary_token_endpoint(
    token_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves detailed forensic records and presigned download URL for a specific canary token."""
    token = db.query(CanaryToken).filter(CanaryToken.token_id == token_id).first()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canary token not found."
        )

    if token.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this canary token."
        )

    d_url = None
    if token.job and token.job.s3_output_key:
        d_url = job_service.get_download_url_or_fallback(token.job, output=True)

    return CanaryTokenRead(
        token_id=token.token_id,
        user_id=token.user_id,
        job_id=token.job_id,
        recipient_name=token.recipient_name,
        recipient_email=token.recipient_email,
        organization=token.organization,
        tracking_note=token.tracking_note,
        original_sha256=token.original_sha256,
        watermarked_sha256=token.watermarked_sha256,
        steganography_method=token.steganography_method,
        status=token.status,
        created_at=token.created_at,
        revoked_at=token.revoked_at,
        download_ip=token.download_ip,
        download_url=d_url
    )


@router.post("/tokens/{token_id}/revoke", response_model=CanaryRevokeResponse, summary="Revoke Canary Token")
async def revoke_canary_token_endpoint(
    token_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revokes a canary token. Any future verification will report the document as REVOKED."""
    revoked = CanaryService.revoke_token(token_id=token_id, user=user, db=db)
    return CanaryRevokeResponse(
        token_id=revoked.token_id,
        status=revoked.status,
        revoked_at=revoked.revoked_at,
        message="Canary token has been successfully revoked. Future verifications will reflect its revoked status."
    )

