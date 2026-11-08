import pytest
from unittest.mock import MagicMock
from botocore.exceptions import ClientError
from fastapi import HTTPException

from app.core.config import config
from app.services.storage import StorageService, LOCAL_STORAGE_DIR


@pytest.fixture
def production_env(monkeypatch):
    """Enforces production environment during test execution."""
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    yield
    monkeypatch.setattr(config, "ENVIRONMENT", "development")


def test_production_s3_upload_fails_when_s3_unavailable(production_env, monkeypatch):
    """In production, upload_file must raise HTTP 500 if S3 is unavailable and NEVER touch local disk."""
    svc = StorageService(bucket_name="test-bucket", region="ap-south-1")
    monkeypatch.setattr(svc, "_s3_available", False)
    monkeypatch.setattr(svc, "_s3_client", None)

    target_key = "users/test-user/processed/audit_test_file.pdf"
    local_path = LOCAL_STORAGE_DIR / target_key.replace("/", "\\")
    if local_path.exists():
        local_path.unlink()

    with pytest.raises(HTTPException) as exc_info:
        svc.upload_file(b"%PDF-1.4 mock content", target_key)

    assert exc_info.value.status_code == 500
    assert "Amazon S3 storage service is unavailable" in exc_info.value.detail
    # Verify local fallback was strictly NOT written to
    assert not local_path.exists()


def test_production_s3_upload_fails_on_s3_client_error(production_env, monkeypatch):
    """In production, S3 put_object ClientError must raise HTTP 500 without local fallback."""
    svc = StorageService(bucket_name="test-bucket", region="ap-south-1")
    mock_client = MagicMock()
    mock_client.put_object.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "AWS S3 Internal Failure"}},
        "PutObject"
    )
    monkeypatch.setattr(svc, "_s3_available", True)
    monkeypatch.setattr(svc, "_s3_client", mock_client)

    target_key = "users/test-user/processed/audit_client_error.pdf"
    local_path = LOCAL_STORAGE_DIR / target_key.replace("/", "\\")
    if local_path.exists():
        local_path.unlink()

    with pytest.raises(HTTPException) as exc_info:
        svc.upload_file(b"%PDF-1.4 mock content", target_key)

    assert exc_info.value.status_code == 500
    assert "Failed to upload file to Amazon S3" in exc_info.value.detail
    assert not local_path.exists()


def test_production_s3_download_fails_when_key_missing(production_env, monkeypatch):
    """In production, missing S3 key must return HTTP 404, never local file."""
    svc = StorageService(bucket_name="test-bucket", region="ap-south-1")
    mock_client = MagicMock()
    mock_client.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "The specified key does not exist."}},
        "GetObject"
    )
    monkeypatch.setattr(svc, "_s3_available", True)
    monkeypatch.setattr(svc, "_s3_client", mock_client)

    target_key = "users/test-user/raw/missing_document.pdf"
    with pytest.raises(HTTPException) as exc_info:
        svc.download_file(target_key)

    assert exc_info.value.status_code == 404
    assert "Requested document object not found" in exc_info.value.detail


def test_production_s3_download_fails_on_internal_s3_error(production_env, monkeypatch):
    """In production, S3 internal errors raise HTTP 500 without local fallback."""
    svc = StorageService(bucket_name="test-bucket", region="ap-south-1")
    mock_client = MagicMock()
    mock_client.get_object.side_effect = ClientError(
        {"Error": {"Code": "SlowDown", "Message": "Reduce your request rate."}},
        "GetObject"
    )
    monkeypatch.setattr(svc, "_s3_available", True)
    monkeypatch.setattr(svc, "_s3_client", mock_client)

    target_key = "users/test-user/raw/throttled_doc.pdf"
    with pytest.raises(HTTPException) as exc_info:
        svc.download_file(target_key)

    assert exc_info.value.status_code == 500
    assert "Failed to retrieve file from Amazon S3" in exc_info.value.detail


def test_production_s3_delete_fails_on_client_error(production_env, monkeypatch):
    """In production, S3 delete error raises HTTP 500."""
    svc = StorageService(bucket_name="test-bucket", region="ap-south-1")
    mock_client = MagicMock()
    mock_client.delete_object.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
        "DeleteObject"
    )
    monkeypatch.setattr(svc, "_s3_available", True)
    monkeypatch.setattr(svc, "_s3_client", mock_client)

    target_key = "users/test-user/raw/protected_doc.pdf"
    with pytest.raises(HTTPException) as exc_info:
        svc.delete_file(target_key)

    assert exc_info.value.status_code == 500
    assert "Failed to delete object from Amazon S3" in exc_info.value.detail

