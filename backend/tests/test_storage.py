import pytest
from fastapi import HTTPException
from app.services.storage import StorageService


def test_storage_key_builders():
    guest_raw = StorageService.build_guest_raw_key("session123", "test.pdf")
    assert guest_raw == "guest/session123/raw/test.pdf"

    guest_proc = StorageService.build_guest_processed_key("session123", "merged.pdf")
    assert guest_proc == "guest/session123/processed/merged.pdf"

    user_raw = StorageService.build_user_raw_key("cognito-sub-abc", "sample.pdf")
    assert user_raw == "users/cognito-sub-abc/raw/sample.pdf"

    user_proc = StorageService.build_user_processed_key("cognito-sub-abc", "compressed.pdf")
    assert user_proc == "users/cognito-sub-abc/processed/compressed.pdf"

    forensic = StorageService.build_forensic_key("token-xyz")
    assert forensic == "forensic/watermark_records/token-xyz.json"


def test_storage_upload_download_delete():
    service = StorageService()
    key = "users/test-sub/raw/test_document.txt"
    content = b"CloudPDF Studio Storage Unit Test"

    # Upload
    uploaded_key = service.upload_file(content, key, content_type="text/plain")
    assert uploaded_key == key

    # Exists check
    assert service.object_exists(key) is True

    # Metadata check
    meta = service.get_object_metadata(key)
    assert meta is not None
    assert meta["content_length"] == len(content)

    # Download
    downloaded = service.download_file(key)
    assert downloaded == content

    # Delete
    assert service.delete_file(key) is True
    assert service.object_exists(key) is False


def test_storage_tenant_isolation_member():
    # User A tries to access their own file -> SUCCESS
    key_a = "users/sub-a/processed/file.pdf"
    assert StorageService.verify_access(key_a, user_sub="sub-a") is True

    # User B tries to access User A's file -> HTTP 403 FORBIDDEN
    with pytest.raises(HTTPException) as exc:
        StorageService.verify_access(key_a, user_sub="sub-b")
    assert exc.value.status_code == 403


def test_storage_tenant_isolation_guest():
    # Guest 1 tries to access their own file -> SUCCESS
    key_guest1 = "guest/sess-1/processed/output.pdf"
    assert StorageService.verify_access(key_guest1, session_id="sess-1") is True

    # Guest 2 tries to access Guest 1's file -> HTTP 403 FORBIDDEN
    with pytest.raises(HTTPException) as exc:
        StorageService.verify_access(key_guest1, session_id="sess-2")
    assert exc.value.status_code == 403


def test_storage_path_traversal_rejection():
    # Attempt path traversal
    with pytest.raises(HTTPException) as exc:
        StorageService.validate_storage_path("../secret.env")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        StorageService.validate_storage_path("/absolute/path/file.pdf")
    assert exc.value.status_code == 400


def test_storage_s3_client_uses_sigv4_and_virtual_addressing(monkeypatch):
    """
    Verifies that StorageService initializes the S3 client with:
    - SigV4 signature version ('s3v4')
    - Virtual-hosted addressing style ('virtual')
    """
    import boto3
    from unittest.mock import MagicMock

    captured_kwargs = {}
    original_client = boto3.client

    def mock_boto3_client(service_name, **kwargs):
        captured_kwargs.update(kwargs)
        mock_cli = MagicMock()
        mock_cli.head_bucket.return_value = {}
        return mock_cli

    monkeypatch.setattr(boto3, "client", mock_boto3_client)
    service = StorageService(bucket_name="cloudpdf-studio-storage-2026", region="ap-south-1")

    assert captured_kwargs.get("region_name") == "ap-south-1"
    config_obj = captured_kwargs.get("config")
    assert config_obj is not None
    assert config_obj.signature_version == "s3v4"
    assert config_obj.s3 == {"addressing_style": "virtual"}
    assert service.is_s3_active() is True


def test_storage_generate_presigned_url_uses_get_object_and_preserves_filename(monkeypatch):
    """
    Verifies that generate_presigned_url():
    - Generates presigned URLs for 'get_object'
    - Preserves download filename in ResponseContentDisposition
    - Incorporates virtual-hosted addressing and SigV4 query parameters
    """
    import boto3
    from botocore.config import Config

    # Create real Boto3 client with the configured SigV4 and virtual addressing
    s3_cfg = Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
    test_client = boto3.client(
        "s3",
        region_name="ap-south-1",
        config=s3_cfg,
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret"
    )

    service = StorageService(bucket_name="cloudpdf-studio-storage-2026", region="ap-south-1")
    monkeypatch.setattr(service, "_s3_client", test_client)
    monkeypatch.setattr(service, "_s3_available", True)

    key = "users/123/processed/audit_output.pdf"
    download_filename = "Invoice_2026.pdf"

    url = service.generate_presigned_url(
        key=key,
        expiration=1800,
        download_filename=download_filename
    )

    assert url is not None
    # 1. Virtual-hosted addressing domain
    assert "cloudpdf-studio-storage-2026.s3.ap-south-1.amazonaws.com" in url
    # 2. SigV4 parameters
    assert "X-Amz-Algorithm=AWS4-HMAC-SHA256" in url
    assert "X-Amz-Signature=" in url
    # 3. Preserved download filename
    assert "response-content-disposition=" in url
    assert "Invoice_2026.pdf" in url

