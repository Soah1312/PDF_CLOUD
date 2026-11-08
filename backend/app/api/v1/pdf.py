import io
import os
import json
import logging
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    Header,
    Response,
    HTTPException,
    status
)
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.models.user import User
from app.schemas.document import PDFProcessResponse
from app.services.file_validator import sanitize_filename, validate_file_signature
from app.services.storage import storage_service
from app.services.pdf_engine import pdf_engine
from app.services.job_service import resolve_caller_identity, job_service

logger = logging.getLogger("cloudpdf.api.pdf")
router = APIRouter(prefix="/pdf", tags=["PDF Operations"])


@router.post("/merge", response_model=PDFProcessResponse, summary="Merge Multiple PDFs")
async def merge_pdfs_endpoint(
    response: Response,
    files: List[UploadFile] = File(...),
    file_order: Optional[str] = Form(None),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    if len(files) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least two PDF files are required for a merge operation."
        )

    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    # Read uploaded bytes
    read_files = []
    file_map = {}
    total_input_bytes = 0

    for f in files:
        data = await f.read()
        name = sanitize_filename(f.filename or "doc.pdf")
        read_files.append((name, data))
        file_map[name] = data
        total_input_bytes += len(data)

    # Apply ordering if specified
    if file_order:
        try:
            order_names = json.loads(file_order)
            ordered_files = []
            for name in order_names:
                clean_n = sanitize_filename(name)
                if clean_n in file_map:
                    ordered_files.append((clean_n, file_map[clean_n]))
            if len(ordered_files) == len(files):
                read_files = ordered_files
        except Exception:
            pass

    # Build storage keys
    first_name = read_files[0][0]
    output_name = f"merged_{os.path.splitext(first_name)[0]}_and_{len(files)-1}_more.pdf"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, f"batch_{first_name}")
        proc_key = storage_service.build_user_processed_key(cognito_sub, output_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, f"batch_{first_name}")
        proc_key = storage_service.build_guest_processed_key(session_id, output_name)

    # Save original bundle or first file in storage
    storage_service.upload_file(read_files[0][1], raw_key, "application/pdf")

    # Record job in DB
    job = job_service.create_pending_job(
        db=db,
        action_type="MERGE",
        original_filename=f"{len(files)} files merged",
        file_size_bytes=total_input_bytes,
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        merged_bytes = pdf_engine.merge_pdfs(read_files)
        storage_service.upload_file(merged_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(merged_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="MERGE",
            status="COMPLETED",
            original_filename=job.original_filename,
            output_filename=output_name,
            file_size_bytes=total_input_bytes,
            output_file_size_bytes=len(merged_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")


@router.post("/split", response_model=PDFProcessResponse, summary="Split or Extract PDF Pages")
async def split_pdf_endpoint(
    response: Response,
    file: UploadFile = File(...),
    page_ranges: Optional[str] = Form(None),
    extract_pages: Optional[str] = Form(None),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="SPLIT",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        pages_list = None
        if extract_pages:
            pages_list = [int(p.strip()) for p in extract_pages.split(",") if p.strip()]

        out_bytes, out_filename, content_type = pdf_engine.split_pdf(
            file_bytes=content,
            original_filename=orig_name,
            page_ranges=page_ranges,
            extract_pages=pages_list
        )

        if cognito_sub:
            proc_key = storage_service.build_user_processed_key(cognito_sub, out_filename)
        else:
            proc_key = storage_service.build_guest_processed_key(session_id, out_filename)

        storage_service.upload_file(out_bytes, proc_key, content_type)
        job_service.complete_job(db, job, proc_key, len(out_bytes), content_type)
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="SPLIT",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_filename,
            file_size_bytes=len(content),
            output_file_size_bytes=len(out_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")


@router.post("/rotate", response_model=PDFProcessResponse, summary="Rotate PDF Pages")
async def rotate_pdf_endpoint(
    response: Response,
    file: UploadFile = File(...),
    angle: int = Form(90),
    page_numbers: Optional[str] = Form(None),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")
    out_name = f"rotated_{angle}_{orig_name}"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="ROTATE",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        pages = None
        if page_numbers:
            pages = [int(p.strip()) for p in page_numbers.split(",") if p.strip()]

        rotated_bytes = pdf_engine.rotate_pdf(content, angle=angle, page_numbers=pages, original_filename=orig_name)
        storage_service.upload_file(rotated_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(rotated_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="ROTATE",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(rotated_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Rotation failed: {str(e)}")


@router.post("/protect", response_model=PDFProcessResponse, summary="Encrypt & Password-Protect PDF")
async def protect_pdf_endpoint(
    response: Response,
    file: UploadFile = File(...),
    password: str = Form(...),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")
    out_name = f"protected_{orig_name}"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="PROTECT",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        protected_bytes = pdf_engine.protect_pdf(content, password=password, original_filename=orig_name)
        storage_service.upload_file(protected_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(protected_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="PROTECT",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(protected_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Protection failed: {str(e)}")


@router.post("/compress", response_model=PDFProcessResponse, summary="Optimize & Compress PDF")
async def compress_pdf_endpoint(
    response: Response,
    file: UploadFile = File(...),
    level: str = Form("medium"),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")
    out_name = f"compressed_{orig_name}"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="COMPRESS",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        compressed_bytes, stats = pdf_engine.compress_pdf(content, level=level, original_filename=orig_name)
        storage_service.upload_file(compressed_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(compressed_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="COMPRESS",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(compressed_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
            stats=stats,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@router.post("/watermark", response_model=PDFProcessResponse, summary="Apply Text Watermark")
async def watermark_pdf_endpoint(
    response: Response,
    file: UploadFile = File(...),
    text: str = Form(...),
    font_size: int = Form(40),
    opacity: float = Form(0.3),
    rotation: float = Form(45.0),
    position: str = Form("center"),
    color: str = Form("#888888"),
    pages: Optional[str] = Form(None),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")
    out_name = f"watermarked_{orig_name}"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="WATERMARK",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        pages_list = [int(p.strip()) for p in pages.split(",") if p.strip()] if pages else None
        watermarked_bytes = pdf_engine.watermark_pdf(
            file_bytes=content,
            text=text,
            font_size=font_size,
            opacity=opacity,
            rotation=rotation,
            position=position,
            color=color,
            pages=pages_list,
            original_filename=orig_name
        )

        storage_service.upload_file(watermarked_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(watermarked_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="WATERMARK",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(watermarked_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Watermark failed: {str(e)}")


@router.post("/to-images", response_model=PDFProcessResponse, summary="Convert PDF Pages to Images")
async def pdf_to_images_endpoint(
    response: Response,
    file: UploadFile = File(...),
    img_format: str = Form("png"),
    dpi: int = Form(150),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    content = await file.read()
    orig_name = sanitize_filename(file.filename or "document.pdf")

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="PDF_TO_IMAGES",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        out_bytes, out_name, ctype = pdf_engine.pdf_to_images(
            file_bytes=content,
            img_format=img_format,
            dpi=dpi,
            original_filename=orig_name
        )

        if cognito_sub:
            proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
        else:
            proc_key = storage_service.build_guest_processed_key(session_id, out_name)

        storage_service.upload_file(out_bytes, proc_key, ctype)
        job_service.complete_job(db, job, proc_key, len(out_bytes), ctype)
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="PDF_TO_IMAGES",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(out_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"PDF to images conversion failed: {str(e)}")


@router.post("/from-images", response_model=PDFProcessResponse, summary="Convert Images to Single PDF")
async def images_to_pdf_endpoint(
    response: Response,
    files: List[UploadFile] = File(...),
    file_order: Optional[str] = Form(None),
    x_guest_session_id: Optional[str] = Header(None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one image file is required.")

    user_id, cognito_sub, session_id = resolve_caller_identity(user, x_guest_session_id)
    if session_id:
        response.headers["X-Guest-Session-ID"] = session_id

    read_images = []
    image_map = {}
    total_bytes = 0

    for f in files:
        data = await f.read()
        name = sanitize_filename(f.filename or "image.jpg")
        read_images.append((name, data))
        image_map[name] = data
        total_bytes += len(data)

    if file_order:
        try:
            order_names = json.loads(file_order)
            ordered = []
            for name in order_names:
                clean_n = sanitize_filename(name)
                if clean_n in image_map:
                    ordered.append((clean_n, image_map[clean_n]))
            if len(ordered) == len(files):
                read_images = ordered
        except Exception:
            pass

    first_name = os.path.splitext(read_images[0][0])[0]
    out_name = f"{first_name}_combined.pdf"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, f"images_{read_images[0][0]}")
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, f"images_{read_images[0][0]}")
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(read_images[0][1], raw_key, "image/jpeg")

    job = job_service.create_pending_job(
        db=db,
        action_type="IMAGES_TO_PDF",
        original_filename=f"{len(files)} images",
        file_size_bytes=total_bytes,
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        pdf_bytes = pdf_engine.images_to_pdf(read_images)
        storage_service.upload_file(pdf_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(pdf_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="IMAGES_TO_PDF",
            status="COMPLETED",
            original_filename=job.original_filename,
            output_filename=out_name,
            file_size_bytes=total_bytes,
            output_file_size_bytes=len(pdf_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Images to PDF failed: {str(e)}")


@router.post("/to-word", response_model=PDFProcessResponse, summary="Convert PDF to Word DOCX")
async def pdf_to_word_endpoint(
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
    orig_name = sanitize_filename(file.filename or "document.pdf")
    base_name = os.path.splitext(orig_name)[0]
    out_name = f"{base_name}.docx"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, "application/pdf")

    job = job_service.create_pending_job(
        db=db,
        action_type="PDF_TO_WORD",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id
    )

    try:
        docx_bytes = pdf_engine.pdf_to_word(content, original_filename=orig_name)
        docx_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        storage_service.upload_file(docx_bytes, proc_key, docx_mime)
        job_service.complete_job(db, job, proc_key, len(docx_bytes), docx_mime)
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="PDF_TO_WORD",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(docx_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"PDF to Word failed: {str(e)}")


@router.post("/from-word", response_model=PDFProcessResponse, summary="Convert Word DOCX to PDF")
async def word_to_pdf_endpoint(
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
    orig_name = sanitize_filename(file.filename or "document.docx")
    base_name = os.path.splitext(orig_name)[0]
    out_name = f"{base_name}.pdf"

    docx_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    if cognito_sub:
        raw_key = storage_service.build_user_raw_key(cognito_sub, orig_name)
        proc_key = storage_service.build_user_processed_key(cognito_sub, out_name)
    else:
        raw_key = storage_service.build_guest_raw_key(session_id, orig_name)
        proc_key = storage_service.build_guest_processed_key(session_id, out_name)

    storage_service.upload_file(content, raw_key, docx_mime)

    job = job_service.create_pending_job(
        db=db,
        action_type="WORD_TO_PDF",
        original_filename=orig_name,
        file_size_bytes=len(content),
        s3_input_key=raw_key,
        user_id=user_id,
        session_id=session_id,
        mime_type=docx_mime
    )

    try:
        pdf_bytes = pdf_engine.word_to_pdf(content, original_filename=orig_name)
        storage_service.upload_file(pdf_bytes, proc_key, "application/pdf")
        job_service.complete_job(db, job, proc_key, len(pdf_bytes), "application/pdf")
        download_url = job_service.get_download_url_or_fallback(job, output=True)

        return PDFProcessResponse(
            job_id=job.id,
            action_type="WORD_TO_PDF",
            status="COMPLETED",
            original_filename=orig_name,
            output_filename=out_name,
            file_size_bytes=len(content),
            output_file_size_bytes=len(pdf_bytes),
            download_url=download_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            expires_at=job.expires_at,
        )
    except Exception as e:
        job_service.fail_job(db, job, str(e))
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Word to PDF failed: {str(e)}")

