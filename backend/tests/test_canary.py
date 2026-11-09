import os
import json
import uuid
import pytest
import fitz
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from app.models.document import PDFJob, CanaryToken
from app.services.canary_service import CanaryService
from app.services.pdf_engine import PDFEngineService
from app.services.storage import StorageService


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "canary_test.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def sample_user(db_session):
    user = User(
        id=uuid.uuid4(),
        cognito_sub="sub-canary-owner-1234",
        email="auditor@enterprise.com"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_user(db_session):
    user = User(
        id=uuid.uuid4(),
        cognito_sub="sub-other-person-5678",
        email="unauthorized@thirdparty.com"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def sample_pdf_bytes():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "CONFIDENTIAL BOARD REPORT - STRICTLY PROPRIETARY")
    page.insert_text((72, 120), "Project Alpha Financial Projections and M&A Valuation")
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_canary_token_generation_uniqueness_and_format():
    tokens = [CanaryService.generate_token_id() for _ in range(50)]
    assert len(set(tokens)) == 50, "All generated tokens must be unique"
    for tok in tokens:
        assert tok.startswith("CPDF-CANARY-")
        assert CanaryService.validate_token_format(tok) is True


def test_canary_token_tampering_detection():
    valid_token = CanaryService.generate_token_id()
    assert CanaryService.validate_token_format(valid_token) is True

    # Corrupt last character (checksum)
    tampered_chk = valid_token[:-1] + ("0" if valid_token[-1] != "0" else "1")
    assert CanaryService.validate_token_format(tampered_chk) is False

    # Corrupt body (ensure character actually changes)
    corrupt_char = "0" if valid_token[15] != "0" else "1"
    tampered_body = valid_token[:15] + corrupt_char + valid_token[16:]
    assert CanaryService.validate_token_format(tampered_body) is False


def test_canary_embedding_and_extraction(sample_pdf_bytes):
    token_id = CanaryService.generate_token_id()
    watermarked_bytes, orig_hash, wm_hash = CanaryService.embed_watermark(
        file_bytes=sample_pdf_bytes,
        token_id=token_id,
        recipient_metadata={"organization": "Apex Capital", "recipient_name": "Jane Doe"}
    )

    assert watermarked_bytes is not None
    assert len(watermarked_bytes) > 0
    assert orig_hash != wm_hash

    # Extract markers
    extracted_token, markers = CanaryService.extract_canary_markers(watermarked_bytes)
    assert extracted_token == token_id
    assert "CONTENT_STREAM_MODE3" in markers
    assert "METADATA_KEYWORDS" in markers
    assert "CATALOG_DICTIONARY" in markers


def test_canary_survivability_through_saving_and_compression(sample_pdf_bytes):
    token_id = CanaryService.generate_token_id()
    watermarked_bytes, _, _ = CanaryService.embed_watermark(
        file_bytes=sample_pdf_bytes,
        token_id=token_id
    )

    # 1. Simulate saving and reopening through PyMuPDF
    doc1 = fitz.open(stream=watermarked_bytes, filetype="pdf")
    resaved_bytes = doc1.tobytes()
    doc1.close()

    tok_after_resave, _ = CanaryService.extract_canary_markers(resaved_bytes)
    assert tok_after_resave == token_id, "Token must survive saving and reopening"

    # 2. Simulate high compression (stream deflation and garbage collection)
    compressed_bytes, _ = PDFEngineService.compress_pdf(watermarked_bytes, level="high")
    tok_after_compress, markers_after_comp = CanaryService.extract_canary_markers(compressed_bytes)
    assert tok_after_compress == token_id, "Token must survive high PDF compression"
    assert "CONTENT_STREAM_MODE3" in markers_after_comp

    # 3. Simulate page rotation
    rotated_bytes = PDFEngineService.rotate_pdf(watermarked_bytes, angle=90)
    tok_after_rotation, _ = CanaryService.extract_canary_markers(rotated_bytes)
    assert tok_after_rotation == token_id, "Token must survive page rotation"


def test_canary_verification_full_lifecycle(db_session, sample_user, other_user, sample_pdf_bytes):
    token_id = CanaryService.generate_token_id()
    watermarked_bytes, orig_sha, wm_sha = CanaryService.embed_watermark(
        file_bytes=sample_pdf_bytes,
        token_id=token_id,
        recipient_metadata={
            "recipient_name": "Acme Partner",
            "recipient_email": "partner@acme.com",
            "organization": "Acme Corp",
            "tracking_note": "Board deck batch A"
        }
    )

    # Create Job record
    job = PDFJob(
        id=uuid.uuid4(),
        user_id=sample_user.id,
        action_type="CANARY_WATERMARK",
        original_filename="financials.pdf",
        s3_input_key="raw.pdf",
        s3_output_key="proc.pdf",
        file_size_bytes=len(sample_pdf_bytes),
        status="COMPLETED"
    )
    db_session.add(job)
    db_session.commit()

    # Create Ledger (mock S3 upload)
    with patch.object(StorageService, "upload_file") as mock_upload:
        token_record = CanaryService.create_and_store_ledger(
            db=db_session,
            user=sample_user,
            job=job,
            token_id=token_id,
            original_sha256=orig_sha,
            watermarked_sha256=wm_sha,
            recipient_name="Acme Partner",
            recipient_email="partner@acme.com",
            organization="Acme Corp",
            tracking_note="Board deck batch A",
            download_ip="203.0.113.195"
        )
        assert mock_upload.called

    # 1. Verify as Owner -> Should have full confidential metadata
    with patch.object(StorageService, "download_file", return_value=b"{}"):
        owner_result = CanaryService.verify_document(
            file_bytes=watermarked_bytes,
            db=db_session,
            current_user=sample_user
        )
        assert owner_result.status == "VERIFIED"
        assert owner_result.is_owner is True
        assert owner_result.token_id == token_id
        assert owner_result.recipient_name == "Acme Partner"
        assert owner_result.recipient_email == "partner@acme.com"
        assert owner_result.tracking_note == "Board deck batch A"
        assert owner_result.creator_email == sample_user.email

    # 2. Verify as Other User -> Sensitive recipient details must be masked
    with patch.object(StorageService, "download_file", return_value=b"{}"):
        other_result = CanaryService.verify_document(
            file_bytes=watermarked_bytes,
            db=db_session,
            current_user=other_user
        )
        assert other_result.status == "VERIFIED"
        assert other_result.is_owner is False
        assert other_result.token_id is None, "Exact token ID must be hidden from non-owners"
        assert other_result.token_masked.startswith("CPDF-CANARY-")
        assert other_result.recipient_name is None, "Recipient name must NOT be leaked to third parties"
        assert other_result.recipient_email is None, "Recipient email must NOT be leaked to third parties"
        assert other_result.tracking_note is None, "Tracking note must NOT be leaked to third parties"

    # 3. Revoke Token
    with patch.object(StorageService, "upload_file"):
        CanaryService.revoke_token(token_id=token_id, user=sample_user, db=db_session)

    # 4. Verify Revoked Token
    with patch.object(StorageService, "download_file", return_value=b"{}"):
        revoked_result = CanaryService.verify_document(
            file_bytes=watermarked_bytes,
            db=db_session,
            current_user=sample_user
        )
        assert revoked_result.status == "REVOKED"


def test_canary_verification_no_token(db_session, sample_pdf_bytes):
    # Plain document without canary watermark
    result = CanaryService.verify_document(
        file_bytes=sample_pdf_bytes,
        db=db_session
    )
    assert result.status == "NOT_FOUND"
    assert result.token_id is None


def test_canary_hmac_secret_production_fail_safe():
    """Verifies that production fails safely if CANARY_HMAC_SECRET is missing or insecure."""
    from app.core.config import Settings, get_settings

    # 1. Missing in production -> must raise RuntimeError
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "CANARY_HMAC_SECRET": ""}, clear=True):
        get_settings.cache_clear()
        with pytest.raises(RuntimeError, match="CANARY_HMAC_SECRET is missing or insecure"):
            get_settings()

    # 2. Insecure / short in production -> must raise RuntimeError
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "CANARY_HMAC_SECRET": "too_short_secret"}, clear=True):
        get_settings.cache_clear()
        with pytest.raises(RuntimeError, match="at least 32 characters"):
            get_settings()

    # 3. Known placeholder default in production -> must raise RuntimeError
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "CANARY_HMAC_SECRET": "cloudpdf_forensic_canary_hmac_secret_2026_ap_south_1"}, clear=True):
        get_settings.cache_clear()
        with pytest.raises(RuntimeError, match="insecure or placeholder default"):
            get_settings()

    # 4. Valid 32+ char secret in production -> succeeds
    valid_secret = "a" * 64
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "CANARY_HMAC_SECRET": valid_secret}, clear=True):
        get_settings.cache_clear()
        s = get_settings()
        assert s.CANARY_HMAC_SECRET == valid_secret

    # Restore default dev settings
    get_settings.cache_clear()

