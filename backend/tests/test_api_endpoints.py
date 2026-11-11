import io
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

import fitz
from app.main import app
from app.models.base import Base
from app.models.user import User
from app.models.document import PDFJob
from app.api.deps import get_db, get_current_user, get_optional_user

# In-memory SQLite database for test isolation
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_api_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_optional_user, None)

client = TestClient(app)


def make_pdf(num_pages: int = 1, text: str = "Test") -> bytes:
    doc = fitz.open()
    for i in range(1, num_pages + 1):
        page = doc.new_page(width=595, height=842)
        page.insert_text(fitz.Point(50, 50), f"{text} - Page {i}")
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "environment" in data
    assert "region" in data


def test_auth_config_endpoint():
    res = client.get("/api/v1/auth/config")
    assert res.status_code == 200
    data = res.json()
    assert data["region"] == "ap-south-1"
    assert data["userPoolId"] == "ap-south-1_gwFz137XV"
    assert data["clientId"] == "3oij56tppqgoqnvs9dg352fe8t"
    assert data["isConfigured"] is True


def test_guest_merge_pdf_end_to_end():
    pdf1 = make_pdf(1, "Doc 1")
    pdf2 = make_pdf(2, "Doc 2")

    guest_session_id = str(uuid.uuid4())
    headers = {"X-Guest-Session-ID": guest_session_id}

    response = client.post(
        "/api/v1/pdf/merge",
        files=[
            ("files", ("first.pdf", pdf1, "application/pdf")),
            ("files", ("second.pdf", pdf2, "application/pdf")),
        ],
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["action_type"] == "MERGE"
    assert data["status"] == "COMPLETED"
    assert data["output_file_size_bytes"] > 0
    assert "download_url" in data

    # Verify session returned in header
    assert response.headers.get("X-Guest-Session-ID") == guest_session_id

    # Verify job recorded in DB
    with TestingSessionLocal() as db:
        job = db.query(PDFJob).filter(PDFJob.id == uuid.UUID(data["job_id"])).first()
        assert job is not None
        assert job.session_id == guest_session_id
        assert job.status == "COMPLETED"
        assert job.expires_at is not None
        assert "guest/" in job.s3_input_key
        assert "guest/" in job.s3_output_key

    # Test downloading the merged PDF via download endpoint
    dl_res = client.get(f"/api/v1/files/{data['job_id']}/download", headers=headers)
    assert dl_res.status_code in (200, 307)
    if dl_res.status_code == 200:
        assert dl_res.content.startswith(b"%PDF-")


def test_guest_split_pdf():
    pdf = make_pdf(3, "Split Doc")
    session_id = str(uuid.uuid4())
    headers = {"X-Guest-Session-ID": session_id}

    res = client.post(
        "/api/v1/pdf/split",
        files={"file": ("input.pdf", pdf, "application/pdf")},
        data={"page_ranges": "1-2"},
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"


def test_guest_compress_pdf():
    pdf = make_pdf(2, "Compress Doc")
    session_id = str(uuid.uuid4())
    headers = {"X-Guest-Session-ID": session_id}

    res = client.post(
        "/api/v1/pdf/compress",
        files={"file": ("to_compress.pdf", pdf, "application/pdf")},
        data={"level": "medium"},
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert "stats" in data


def test_security_isolation_guest_access():
    # Guest A uploads a file
    pdf = make_pdf(1, "Private Guest A Document")
    sess_a = str(uuid.uuid4())
    sess_b = str(uuid.uuid4())

    res = client.post(
        "/api/v1/files/upload",
        files={"file": ("secret_a.pdf", pdf, "application/pdf")},
        headers={"X-Guest-Session-ID": sess_a}
    )
    assert res.status_code == 200
    file_id = res.json()["id"]

    # Guest A accesses it -> 200 OK
    res_a = client.get(f"/api/v1/files/{file_id}", headers={"X-Guest-Session-ID": sess_a})
    assert res_a.status_code == 200

    # Guest B attempts to access it -> 403 Forbidden
    res_b = client.get(f"/api/v1/files/{file_id}", headers={"X-Guest-Session-ID": sess_b})
    assert res_b.status_code == 403

    # Guest B attempts to download it -> 403 Forbidden
    res_b_dl = client.get(f"/api/v1/files/{file_id}/download", headers={"X-Guest-Session-ID": sess_b})
    assert res_b_dl.status_code == 403


def test_authenticated_member_isolation():
    # Create two mock users in DB
    db = TestingSessionLocal()
    user_a = User(
        id=uuid.uuid4(),
        cognito_sub="sub-member-a",
        email="member.a@example.com",
        storage_used_bytes=0
    )
    user_b = User(
        id=uuid.uuid4(),
        cognito_sub="sub-member-b",
        email="member.b@example.com",
        storage_used_bytes=0
    )
    db.add_all([user_a, user_b])
    db.commit()

    # Job owned by User A
    job_a = PDFJob(
        id=uuid.uuid4(),
        user_id=user_a.id,
        action_type="MERGE",
        original_filename="user_a_file.pdf",
        s3_input_key="users/sub-member-a/raw/user_a_file.pdf",
        s3_output_key="users/sub-member-a/processed/user_a_file.pdf",
        file_size_bytes=1000,
        status="COMPLETED"
    )
    db.add(job_a)
    db.commit()
    job_a_id = job_a.id
    user_a_id = user_a.id
    user_b_id = user_b.id
    db.close()

    def get_user_a(session: Session = Depends(override_get_db)):
        return session.query(User).filter(User.id == user_a_id).first()

    def get_user_b(session: Session = Depends(override_get_db)):
        return session.query(User).filter(User.id == user_b_id).first()

    # Caller User A accesses -> Success
    app.dependency_overrides[get_optional_user] = get_user_a
    res_user_a = client.get(f"/api/v1/files/{job_a_id}")
    assert res_user_a.status_code == 200

    # Caller User B accesses -> 403 Forbidden
    app.dependency_overrides[get_optional_user] = get_user_b
    res_user_b = client.get(f"/api/v1/files/{job_a_id}")
    assert res_user_b.status_code == 403

    # Reset override
    del app.dependency_overrides[get_optional_user]


def test_guest_expiration_handling():
    # Job created in the past (expired)
    with TestingSessionLocal() as db:
        expired_sess = str(uuid.uuid4())
        job = PDFJob(
            id=uuid.uuid4(),
            session_id=expired_sess,
            action_type="SPLIT",
            original_filename="expired.pdf",
            s3_input_key=f"guest/{expired_sess}/raw/expired.pdf",
            file_size_bytes=500,
            status="COMPLETED",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=2)  # Expired 2 hours ago
        )
        db.add(job)
        db.commit()
        job_id = job.id

    # Attempting to retrieve expired file returns 410 GONE
    res = client.get(f"/api/v1/files/{job_id}", headers={"X-Guest-Session-ID": expired_sess})
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()


def test_watermark_endpoint_accepts_watermark_text_param():
    pdf_bytes = make_pdf(1, "Watermark Test Document")
    res = client.post(
        "/api/v1/pdf/watermark",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
        data={
            "watermark_text": "TOP SECRET",
            "opacity": 0.5,
            "rotation": 45,
            "color": "#D9441F",
        },
        headers={"X-Guest-Session-ID": str(uuid.uuid4())}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert "watermarked_test.pdf" in data["output_filename"]


def test_watermark_endpoint_accepts_text_param():
    pdf_bytes = make_pdf(1, "Watermark Test Document")
    res = client.post(
        "/api/v1/pdf/watermark",
        files={"file": ("sample.pdf", pdf_bytes, "application/pdf")},
        data={
            "text": "INTERNAL ONLY",
            "opacity": 0.3,
            "rotation": 30,
            "color": "#888888",
        },
        headers={"X-Guest-Session-ID": str(uuid.uuid4())}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert "watermarked_sample.pdf" in data["output_filename"]


def test_word_to_pdf_endpoint_docx():
    import docx
    d = docx.Document()
    d.add_heading("API Test Word Document", level=0)
    d.add_paragraph("Testing word-to-pdf API endpoint.")
    buf = io.BytesIO()
    d.save(buf)
    docx_bytes = buf.getvalue()

    res = client.post(
        "/api/v1/pdf/from-word",
        files={"file": ("proposal.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers={"X-Guest-Session-ID": str(uuid.uuid4())}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert data["output_filename"] == "proposal.pdf"


def test_word_to_pdf_endpoint_docs_extension():
    import docx
    d = docx.Document()
    d.add_paragraph("Testing .docs file extension.")
    buf = io.BytesIO()
    d.save(buf)
    docx_bytes = buf.getvalue()

    res = client.post(
        "/api/v1/pdf/from-word",
        files={"file": ("contract.docs", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers={"X-Guest-Session-ID": str(uuid.uuid4())}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert data["output_filename"] == "contract.pdf"


