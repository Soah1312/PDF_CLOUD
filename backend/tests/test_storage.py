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
