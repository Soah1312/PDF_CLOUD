import io
import os
import re
from typing import Tuple, Optional
from fastapi import HTTPException, status
import pypdf

# Maximum file sizes (in bytes)
MAX_FILE_SIZE_BYTES_GUEST = 25 * 1024 * 1024  # 25 MB
MAX_FILE_SIZE_BYTES_MEMBER = 100 * 1024 * 1024  # 100 MB

# Maximum page counts
MAX_PAGE_COUNT_GUEST = 100
MAX_PAGE_COUNT_MEMBER = 500

# Magic signatures
MAGIC_SIGNATURES = {
    "pdf": b"%PDF-",
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
    "docx": b"PK\x03\x04",
    "zip": b"PK\x03\x04",
}


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal and remove unsafe characters.
    """
    basename = os.path.basename(filename).strip()
    # Strip dangerous characters
    sanitized = re.sub(r'[^a-zA-Z0-9_.-]', '_', basename)
    return sanitized or "document.pdf"


def validate_file_signature(content: bytes, expected_type: str) -> bool:
    """
    Verify magic byte headers for given expected file type.
    """
    expected = expected_type.lower()
    if expected == "pdf":
        return content.startswith(b"%PDF-") or b"%PDF-" in content[:1024]
    elif expected in ("jpeg", "jpg"):
        return content.startswith(b"\xff\xd8\xff")
    elif expected == "png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    elif expected in ("docx", "zip"):
        return content.startswith(b"PK\x03\x04")
    return True


def validate_pdf_content(
    content: bytes,
    filename: str = "document.pdf",
    max_size_bytes: int = MAX_FILE_SIZE_BYTES_MEMBER,
    max_pages: int = MAX_PAGE_COUNT_MEMBER,
    check_encryption: bool = True
) -> Tuple[int, bool]:
    """
    Validates PDF file:
    - Size check
    - Magic signature
    - Structural integrity using pypdf
    - Page count check
    - Encryption detection

    Returns (page_count, is_encrypted).
    Raises HTTPException if invalid.
    """
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded file '{filename}' is empty."
        )

    if len(content) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File '{filename}' exceeds maximum allowed size of {max_mb} MB."
        )

    if not validate_file_signature(content, "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is not a valid PDF document (invalid file signature)."
        )

    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        is_encrypted = reader.is_encrypted

        if is_encrypted and check_encryption:
            # We don't know the password yet, but the document structure exists
            return len(reader.pages) if not reader.is_encrypted else 0, True

        num_pages = len(reader.pages)
        if num_pages > max_pages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PDF '{filename}' contains {num_pages} pages, which exceeds the limit of {max_pages} pages."
            )

        return num_pages, is_encrypted
    except pypdf.errors.PdfReadError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is corrupted or not a valid PDF: {str(e)}"
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to inspect PDF structure for '{filename}'."
        )

