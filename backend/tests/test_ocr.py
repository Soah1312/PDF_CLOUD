import io
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
    SearchablePDFBuilder,
    OCRJobProcessor,
)
from app.services.storage import storage_service

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
    yield
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
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    # Insert multiple paragraphs so it exceeds the digital text threshold
    for i in range(10):
        page.insert_text(pymupdf.Point(50, 100 + i * 30), f"{text} Paragraph line number {i+1} containing sufficient words.")
    b = doc.tobytes()
    doc.close()
    return b


def create_scanned_mock_pdf(num_pages: int = 1, rotation: int = 0) -> bytes:
    """Creates a mock scanned PDF without any embedded digital text."""
    doc = pymupdf.open()
    for _ in range(num_pages):
        page = doc.new_page(width=595, height=842)
        if rotation:
            page.set_rotation(rotation)
        # Draw a rectangle to simulate an image/scanned content
        page.draw_rect(pymupdf.Rect(50, 50, 500, 700), color=(0.8, 0.8, 0.8), fill=(0.95, 0.95, 0.95))
    b = doc.tobytes()
    doc.close()
    return b


# --- 1. Digital Text Inspection Tests ---
def test_inspect_pdf_digital_text_with_embedded_text():
    pdf_bytes = create_digital_pdf("Important confidential report for executive review.")
    result = inspect_pdf_digital_text(pdf_bytes)

    assert result["has_digital_text"] is True
    assert result["recommended_action"] == "SEARCHABLE_ALREADY"
    assert result["detected_words"] > 50
    assert result["page_count"] == 1


def test_inspect_pdf_digital_text_with_scanned_image_only():
    pdf_bytes = create_scanned_mock_pdf(num_pages=2)
    result = inspect_pdf_digital_text(pdf_bytes)

    assert result["has_digital_text"] is False
    assert result["recommended_action"] == "OCR_RECOMMENDED"
    assert result["detected_words"] == 0
    assert result["page_count"] == 2


# --- 2. Searchable PDF Builder Tests ---
def test_searchable_pdf_builder_single_page():
    original_pdf = create_scanned_mock_pdf(num_pages=1)

    # Simulated Textract LINE blocks for page 1
    blocks_by_page = {
        1: [
            {
                "BlockType": "LINE",
                "Text": "INVOICE #98234",
                "Confidence": 99.5,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.15,
                        "Width": 0.4,
                        "Height": 0.04,
                    }
                },
            },
            {
                "BlockType": "LINE",
                "Text": "Total Amount Due: $1,450.00",
                "Confidence": 98.2,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.22,
                        "Width": 0.5,
                        "Height": 0.035,
                    }
                },
            },
        ]
    }

    searchable_pdf_bytes = SearchablePDFBuilder.build_searchable_pdf(original_pdf, blocks_by_page)
    assert len(searchable_pdf_bytes) > 0

    # Verify that the output PDF now contains extractable, searchable text
    doc = pymupdf.open(stream=searchable_pdf_bytes, filetype="pdf")
    assert len(doc) == 1
    page_text = doc[0].get_text()

    assert "INVOICE #98234" in page_text
    assert "Total Amount Due: $1,450.00" in page_text
    doc.close()


def test_searchable_pdf_builder_multipage_and_empty_page():
    # 3-page scanned document
    original_pdf = create_scanned_mock_pdf(num_pages=3)

    blocks_by_page = {
        1: [
            {
                "BlockType": "LINE",
                "Text": "Page One Header Section",
                "Confidence": 99.0,
                "Page": 1,
                "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.1, "Width": 0.5, "Height": 0.04}},
            }
        ],
        # Page 2 is empty (no text detected by OCR)
        3: [
            {
                "BlockType": "LINE",
                "Text": "Page Three Conclusion",
                "Confidence": 97.0,
                "Page": 3,
                "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.1, "Width": 0.5, "Height": 0.04}},
            }
        ],
    }

    output_bytes = SearchablePDFBuilder.build_searchable_pdf(original_pdf, blocks_by_page)
    doc = pymupdf.open(stream=output_bytes, filetype="pdf")
    assert len(doc) == 3

    assert "Page One Header Section" in doc[0].get_text()
    assert doc[1].get_text().strip() == ""  # Page 2 remains empty without corruption
    assert "Page Three Conclusion" in doc[2].get_text()
    doc.close()


def test_searchable_pdf_builder_rotated_page():
    original_pdf = create_scanned_mock_pdf(num_pages=1, rotation=90)
    blocks_by_page = {
        1: [
            {
                "BlockType": "LINE",
                "Text": "Landscape Orientation Text",
                "Confidence": 99.0,
                "Page": 1,
                "Geometry": {"BoundingBox": {"Left": 0.2, "Top": 0.2, "Width": 0.6, "Height": 0.05}},
            }
        ]
    }

    output_bytes = SearchablePDFBuilder.build_searchable_pdf(original_pdf, blocks_by_page)
    doc = pymupdf.open(stream=output_bytes, filetype="pdf")
    assert doc[0].rotation == 90
    assert "Landscape Orientation Text" in doc[0].get_text()
    doc.close()


def test_searchable_pdf_builder_low_confidence_filtering():
    original_pdf = create_scanned_mock_pdf(num_pages=1)
    blocks_by_page = {
        1: [
            {
                "BlockType": "LINE",
                "Text": "High Confidence Text",
                "Confidence": 95.0,
                "Page": 1,
                "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.1, "Width": 0.5, "Height": 0.04}},
            },
            {
                "BlockType": "LINE",
                "Text": "Low Confidence Noise",
                "Confidence": 10.0,  # Below min_confidence threshold of 20.0
                "Page": 1,
                "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.5, "Width": 0.5, "Height": 0.04}},
            },
        ]
    }

    output_bytes = SearchablePDFBuilder.build_searchable_pdf(original_pdf, blocks_by_page, min_confidence=20.0)
    doc = pymupdf.open(stream=output_bytes, filetype="pdf")
    page_text = doc[0].get_text()

    assert "High Confidence Text" in page_text
    assert "Low Confidence Noise" not in page_text
    doc.close()


# --- 3. API Endpoints Tests ---
def test_api_inspect_pdf(client):
    pdf_bytes = create_digital_pdf()
    files = {"file": ("report.pdf", pdf_bytes, "application/pdf")}

    response = client.post("/api/v1/ocr/inspect", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["filename"] == "report.pdf"
    assert data["has_digital_text"] is True
    assert data["recommended_action"] == "SEARCHABLE_ALREADY"
    assert data["detected_words"] > 50


def test_api_searchable_advisory_when_digital_text_exists(client, clean_db):
    pdf_bytes = create_digital_pdf()
    files = {"file": ("digital.pdf", pdf_bytes, "application/pdf")}

    # Without force_ocr
    response = client.post("/api/v1/ocr/searchable", files=files, data={"force_ocr": "false"})
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "REQUIRES_CONFIRMATION"
    assert data["has_digital_text"] is True
    assert data["job_id"] is None
    assert "already appears to contain searchable text" in data["message"]


def test_api_searchable_forced_ocr_or_scanned_pdf(client, clean_db):
    pdf_bytes = create_scanned_mock_pdf(num_pages=2)
    files = {"file": ("scanned_receipt.pdf", pdf_bytes, "application/pdf")}
    headers = {"X-Session-ID": "guest-test-session-123"}

    response = client.post(
        "/api/v1/ocr/searchable",
        files=files,
        data={"force_ocr": "true"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "PENDING"
    assert "job_id" in data
    job_id = data["job_id"]

    # Poll status endpoint
    status_resp = client.get(f"/api/v1/ocr/jobs/{job_id}", headers=headers)
    assert status_resp.status_code == 200
    status_data = status_resp.json()

    assert status_data["original_filename"] == "scanned_receipt.pdf"
    assert status_data["page_count"] == 2
    assert status_data["status"] in ("PENDING", "PROCESSING", "COMPLETED")


def test_api_ocr_job_tenant_isolation(client, clean_db):
    # Create a job belonging to guest A
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    job = OCRJob(
        id=job_id,
        user_id=None,
        guest_session_id="guest-alice",
        original_filename="confidential.pdf",
        original_s3_key="guest/guest-alice/raw/confidential.pdf",
        page_count=1,
        status="COMPLETED",
        processing_stage="COMPLETED",
        progress=100,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(job)
    db.commit()
    db.close()

    # Alice accesses her job -> Success 200
    alice_resp = client.get(f"/api/v1/ocr/jobs/{job_id}", headers={"X-Session-ID": "guest-alice"})
    assert alice_resp.status_code == 200

    # Bob attempts to access Alice's job -> 403 Forbidden
    bob_resp = client.get(f"/api/v1/ocr/jobs/{job_id}", headers={"X-Session-ID": "guest-bob"})
    assert bob_resp.status_code == 403
    assert "Access denied" in bob_resp.json()["detail"]


def test_api_ocr_job_expiration_check(client, clean_db):
    # Create an expired guest job (older than 24 hours)
    db = TestingSessionLocal()
    job_id = uuid.uuid4()
    job = OCRJob(
        id=job_id,
        user_id=None,
        guest_session_id="guest-expired",
        original_filename="old_doc.pdf",
        original_s3_key="guest/guest-expired/raw/old_doc.pdf",
        page_count=1,
        status="COMPLETED",
        processing_stage="COMPLETED",
        progress=100,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),  # Expired 1 hour ago
    )
    db.add(job)
    db.commit()
    db.close()

    # Accessing expired job returns 410 Gone
    resp = client.get(f"/api/v1/ocr/jobs/{job_id}", headers={"X-Session-ID": "guest-expired"})
    assert resp.status_code == 410
    assert "expired" in resp.json()["detail"].lower()


def test_api_invalid_file_rejected(client):
    invalid_file = {"file": ("malicious.txt", b"This is plain text, not a PDF", "text/plain")}
    resp = client.post("/api/v1/ocr/searchable", files=invalid_file)
    assert resp.status_code == 400
    assert "valid PDF" in resp.json()["detail"]
