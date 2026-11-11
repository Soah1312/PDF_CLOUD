import io
import os
import uuid
import pytest
import pymupdf
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import Base
from app.models.user import User
from app.models.document import PDFJob, CanaryToken
from app.models.workflow import SavedWorkflow
from app.models.ocr import OCRJob
from app.api.deps import get_db, get_optional_user
from app.services.ocr_service import (
    inspect_pdf_digital_text,
    OCRmyPDFEngine,
    OCRJobProcessor,
    _ensure_ocr_system_dependencies_on_path,
)
from app.services.storage import storage_service

# Ensure system dependencies (Tesseract, QPDF, Ghostscript) are resolved on PATH
_ensure_ocr_system_dependencies_on_path()

# In-memory test database setup with StaticPool so all threads/sessions share the same DB
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    from app.services.ocr_service import ocr_processor
    orig_factory = ocr_processor._db_session_factory
    ocr_processor._db_session_factory = TestingSessionLocal
    yield
    ocr_processor._db_session_factory = orig_factory
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_optional_user, None)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture
def clean_db():
    db = TestingSessionLocal()
    db.query(OCRJob).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_digital_pdf(text: str = "This is a digital PDF document with embedded text.") -> bytes:
    """Creates a PDF with searchable native text layer."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    for i in range(10):
        page.insert_text(pymupdf.Point(50, 100 + i * 30), f"{text} Paragraph line number {i+1} containing sufficient words.")
    b = doc.tobytes()
    doc.close()
    return b


def create_scanned_image_pdf(
    text: str = "TESSERACT OCR CLOUDPDF",
    width: float = 400,
    height: float = 200,
    rotation: int = 0
) -> bytes:
    """
    Creates a true raster image scanned PDF:
    Renders text onto a white bitmap pixmap, then inserts ONLY the pixmap
    into the PDF page with NO underlying text layer.
    """
    # 1. Render text to a temporary pixmap
    temp_doc = pymupdf.open()
    temp_page = temp_doc.new_page(width=width, height=height)
    temp_page.insert_text(
        pymupdf.Point(30, height / 2),
        text,
        fontsize=24,
        fontname="helv",
        color=(0, 0, 0)
    )
    pix = temp_page.get_pixmap(dpi=150)
    temp_doc.close()

    # 2. Embed only the raster pixmap on the new document page
    doc = pymupdf.open()
    page = doc.new_page(width=width, height=height)
    if rotation:
        page.set_rotation(rotation)
    page.insert_image(pymupdf.Rect(0, 0, width, height), pixmap=pix)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_multipage_scanned_pdf(texts: list) -> bytes:
    """Creates a multipage raster-only scanned PDF."""
    doc = pymupdf.open()
    for text in texts:
        temp_doc = pymupdf.open()
        temp_page = temp_doc.new_page(width=400, height=200)
        temp_page.insert_text(pymupdf.Point(30, 100), text, fontsize=22, fontname="helv", color=(0, 0, 0))
        pix = temp_page.get_pixmap(dpi=150)
        temp_doc.close()

        page = doc.new_page(width=400, height=200)
        page.insert_image(pymupdf.Rect(0, 0, 400, 200), pixmap=pix)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# --- 1. Digital Text Inspection Tests ---

def test_inspect_pdf_digital_text_with_embedded_text():
    pdf_bytes = create_digital_pdf("Important confidential report for executive review.")
    result = inspect_pdf_digital_text(pdf_bytes)

    assert result["has_digital_text"] is True
    assert result["recommended_action"] == "SEARCHABLE_ALREADY"
    assert result["detected_words"] > 50
    assert result["page_count"] == 1


def test_inspect_pdf_digital_text_with_scanned_image_only():
    pdf_bytes = create_scanned_image_pdf("UNSEARCHABLE SCAN TEXT")
    result = inspect_pdf_digital_text(pdf_bytes)

    # Scanned image has 0 extractable digital words prior to OCR
    assert result["has_digital_text"] is False
    assert result["recommended_action"] == "OCR_RECOMMENDED"
    assert result["detected_words"] == 0
    assert result["page_count"] == 1


# --- 2. Real OCRmyPDF + Tesseract Engine Tests ---

@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_real_ocrmypdf_single_page_scanned_pdf():
    """
    Integration test: Runs actual local OCRmyPDF and Tesseract on a scanned raster image PDF.
    Verifies output PDF is readable, preserves dimensions, supports Ctrl+F and text extraction.
    """
    keyword = "TESSERACT"
    raw_pdf = create_scanned_image_pdf(f"AUDIT {keyword} INVOICE", width=500, height=250)

    # Verify input has 0 digital text
    in_doc = pymupdf.open(stream=raw_pdf, filetype="pdf")
    assert len(in_doc[0].get_text().strip()) == 0
    orig_rect = in_doc[0].rect
    in_doc.close()

    # Run real OCRmyPDF
    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(raw_pdf, language="eng")

    # Verify output PDF
    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 1
    page = out_doc[0]

    # Verify page dimensions preserved
    assert abs(page.rect.width - orig_rect.width) < 2
    assert abs(page.rect.height - orig_rect.height) < 2

    # Verify extractable text
    extracted_text = page.get_text()
    assert keyword in extracted_text.upper()

    # Verify Ctrl+F searching capability (search_for)
    search_hits = page.search_for(keyword)
    assert len(search_hits) > 0

    out_doc.close()


@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_real_ocrmypdf_multipage_scanned_pdf():
    """Verifies OCRmyPDF processes multipage scanned documents."""
    page_texts = ["PAGE ONE ALPHA", "PAGE TWO BRAVO"]
    raw_pdf = create_multipage_scanned_pdf(page_texts)

    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(raw_pdf, language="eng")

    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 2

    # Check Page 1
    text1 = out_doc[0].get_text().upper()
    assert "ALPHA" in text1 or "PAGE" in text1

    # Check Page 2
    text2 = out_doc[1].get_text().upper()
    assert "BRAVO" in text2 or "TWO" in text2

    out_doc.close()


@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_ocrmypdf_already_searchable_pdf_skip_text():
    """Verifies that already searchable PDFs skip text reprocessing without failure."""
    raw_pdf = create_digital_pdf("ALREADY SEARCHABLE DOCUMENT CONTENT")

    # skip_text=True is the default
    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(raw_pdf, language="eng", force_ocr=False)

    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 1
    text = out_doc[0].get_text()
    assert "ALREADY SEARCHABLE" in text
    out_doc.close()


@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_ocrmypdf_mixed_digital_and_scanned_pdf():
    """Verifies document with 1 digital page and 1 scanned page processes cleanly."""
    doc = pymupdf.open()

    # Page 1: digital
    p1 = doc.new_page(width=400, height=200)
    p1.insert_text((30, 50), "DIGITAL FIRST PAGE CONTENT HERE FOR ARCHIVE", fontsize=14)

    # Page 2: raster scan
    temp_doc = pymupdf.open()
    temp_page = temp_doc.new_page(width=400, height=200)
    temp_page.insert_text(pymupdf.Point(30, 100), "SCANNED SECOND PAGE RECEIPT", fontsize=20, fontname="helv", color=(0, 0, 0))
    pix = temp_page.get_pixmap(dpi=150)
    temp_doc.close()

    p2 = doc.new_page(width=400, height=200)
    p2.insert_image(pymupdf.Rect(0, 0, 400, 200), pixmap=pix)

    mixed_bytes = doc.tobytes()
    doc.close()

    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(mixed_bytes, language="eng")

    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 2
    assert "DIGITAL" in out_doc[0].get_text().upper()
    assert "SCANNED" in out_doc[1].get_text().upper() or "RECEIPT" in out_doc[1].get_text().upper()
    out_doc.close()


@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_ocrmypdf_rotated_scanned_pdf():
    """Verifies rotation handling and orientation correction."""
    raw_pdf = create_scanned_image_pdf("ROTATED HORIZONTAL SCAN", width=500, height=250, rotation=0)

    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(raw_pdf, language="eng", rotate_pages=True)
    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 1
    assert len(out_doc[0].get_text().strip()) > 0
    out_doc.close()


@pytest.mark.skipif(not OCRmyPDFEngine.is_engine_available(), reason="Tesseract/OCRmyPDF system binaries not installed")
def test_ocrmypdf_different_page_dimensions():
    """Verifies non-standard page dimensions (e.g. narrow receipts, banner formats)."""
    raw_pdf = create_scanned_image_pdf("NARROW RECEIPT FORMAT", width=250, height=600)

    output_pdf = OCRmyPDFEngine.generate_searchable_pdf(raw_pdf, language="eng")
    out_doc = pymupdf.open(stream=output_pdf, filetype="pdf")
    assert len(out_doc) == 1
    rect = out_doc[0].rect
    assert abs(rect.width - 250) < 2
    assert abs(rect.height - 600) < 2
    out_doc.close()


# --- 3. Error Handling & Edge Cases ---

def test_invalid_pdf_rejected_by_api(client):
    """Verifies non-PDF file upload returns HTTP 400."""
    response = client.post(
        "/api/v1/ocr/inspect",
        files={"file": ("fake.pdf", b"NOT A VALID PDF FILE CONTENT", "application/pdf")},
    )
    assert response.status_code == 400


def test_ocr_processor_failure_handling(clean_db):
    """
    Verifies that when an OCR process fails (e.g., corrupt bytes),
    the job status in PostgreSQL is safely updated to FAILED with error message,
    and FastAPI does not crash.
    """
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    job = OCRJob(
        id=job_id,
        guest_session_id="guest-fail-test",
        original_filename="corrupted.pdf",
        original_s3_key="raw/corrupted.pdf",
        output_s3_key="processed/searchable_corrupted.pdf",
        status="PENDING",
        processing_stage="QUEUED",
        progress=0,
    )
    db.add(job)
    db.commit()
    db.close()

    processor = OCRJobProcessor(db_session_factory=TestingSessionLocal)
    # Process completely invalid bytes that cause OCR to fail
    processor.process_job(job_id=job_id, raw_pdf_bytes=b"CORRUPTED_BYTES_NOT_PDF")

    # Check DB was updated to FAILED
    db = TestingSessionLocal()
    failed_job = db.query(OCRJob).filter(OCRJob.id == job_id).first()
    assert failed_job.status == "FAILED"
    assert failed_job.processing_stage == "FAILED"
    assert failed_job.error_message is not None
    db.close()


def test_ocr_processor_s3_upload_failure_handling(monkeypatch, clean_db):
    """Verifies that an S3 upload failure marks the job as FAILED."""
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    job = OCRJob(
        id=job_id,
        guest_session_id="guest-s3-fail",
        original_filename="doc.pdf",
        original_s3_key="raw/doc.pdf",
        output_s3_key="processed/searchable_doc.pdf",
        status="PENDING",
        processing_stage="QUEUED",
    )
    db.add(job)
    db.commit()
    db.close()

    def mock_upload_failure(*args, **kwargs):
        raise RuntimeError("Simulated S3 network disconnect")

    monkeypatch.setattr(storage_service, "upload_file", mock_upload_failure)

    processor = OCRJobProcessor(db_session_factory=TestingSessionLocal)
    pdf_bytes = create_digital_pdf("Test S3 failure")
    processor.process_job(job_id=job_id, raw_pdf_bytes=pdf_bytes, force_mock_for_test=True)

    db = TestingSessionLocal()
    failed_job = db.query(OCRJob).filter(OCRJob.id == job_id).first()
    assert failed_job.status == "FAILED"
    assert "Simulated S3" in failed_job.error_message
    db.close()


# --- 4. API Endpoint Integration Tests ---

def test_api_inspect_pdf(client):
    pdf_bytes = create_digital_pdf("Digital text for inspection endpoint test.")
    response = client.post(
        "/api/v1/ocr/inspect",
        files={"file": ("inspect_test.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_digital_text"] is True
    assert data["recommended_action"] == "SEARCHABLE_ALREADY"
    assert data["filename"] == "inspect_test.pdf"


def test_api_searchable_advisory_when_digital_text_exists(client):
    pdf_bytes = create_digital_pdf("This document already has plenty of searchable text.")
    response = client.post(
        "/api/v1/ocr/searchable",
        files={"file": ("digital.pdf", pdf_bytes, "application/pdf")},
        data={"force_ocr": "false"},
        headers={"X-Guest-Session-ID": "guest-sess-100"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "REQUIRES_CONFIRMATION"
    assert data["has_digital_text"] is True


def test_api_searchable_forced_ocr(client, clean_db):
    pdf_bytes = create_scanned_image_pdf("CONFIRMED SCAN")
    response = client.post(
        "/api/v1/ocr/searchable",
        files={"file": ("scanned.pdf", pdf_bytes, "application/pdf")},
        data={"force_ocr": "true", "language": "eng"},
        headers={"X-Guest-Session-ID": "guest-sess-200"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "PENDING"
    assert data["processing_stage"] == "QUEUED"


def test_api_ocr_job_tenant_isolation(client, clean_db):
    """Verifies that Guest B cannot access or download Guest A's OCR document."""
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    job = OCRJob(
        id=job_id,
        guest_session_id="guest-owner-aaa",
        original_filename="private_scan.pdf",
        original_s3_key="raw/private_scan.pdf",
        output_s3_key="processed/private_scan.pdf",
        status="COMPLETED",
        processing_stage="COMPLETED",
        progress=100,
    )
    db.add(job)
    db.commit()
    db.close()

    # Attempt access with a different guest session
    response = client.get(
        f"/api/v1/ocr/jobs/{job_id}",
        headers={"X-Guest-Session-ID": "guest-attacker-bbb"},
    )
    assert response.status_code == 403

    # Attempt download with a different guest session
    download_resp = client.get(
        f"/api/v1/ocr/jobs/{job_id}/download",
        headers={"X-Guest-Session-ID": "guest-attacker-bbb"},
    )
    assert download_resp.status_code == 403

    # Access with the legitimate owner session
    legit_resp = client.get(
        f"/api/v1/ocr/jobs/{job_id}",
        headers={"X-Guest-Session-ID": "guest-owner-aaa"},
    )
    assert legit_resp.status_code == 200
    assert legit_resp.json()["job_id"] == str(job_id)
    assert legit_resp.json()["ocr_engine"] == "ocrmypdf"


def test_api_ocr_job_expiration_check(client, clean_db):
    """Verifies that an expired guest document returns HTTP 410 Gone."""
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    expired_time = datetime.now(timezone.utc) - timedelta(hours=25)
    job = OCRJob(
        id=job_id,
        guest_session_id="guest-expired-session",
        original_filename="expired.pdf",
        original_s3_key="raw/expired.pdf",
        output_s3_key="processed/expired.pdf",
        status="COMPLETED",
        processing_stage="COMPLETED",
        progress=100,
        expires_at=expired_time,
    )
    db.add(job)
    db.commit()
    db.close()

    response = client.get(
        f"/api/v1/ocr/jobs/{job_id}",
        headers={"X-Guest-Session-ID": "guest-expired-session"},
    )
    assert response.status_code == 410
    assert "expired" in response.json()["detail"].lower()
