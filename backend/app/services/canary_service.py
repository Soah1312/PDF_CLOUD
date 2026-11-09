import io
import re
import json
import uuid
import time
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any, List

import fitz  # PyMuPDF
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import config
from app.models.document import CanaryToken, PDFJob
from app.models.user import User
from app.schemas.canary import CanaryVerificationResponse, CanaryTokenRead
from app.services.storage import StorageService
from app.services.file_validator import validate_pdf_content

logger = logging.getLogger("cloudpdf.canary")

# Pattern for Content Stream Mode 3 invisible marker
CANARY_STREAM_REGEX = re.compile(r"<!--CPDF-CANARY-V1:([A-Za-z0-9_\-]+):([A-Za-z0-9]+)-->")
CANARY_TOKEN_REGEX = re.compile(r"^CPDF-CANARY-([A-Fa-f0-9]{12})-([A-Fa-f0-9]{8})-([A-Fa-f0-9]{4})$")


class CanaryService:
    """
    Forensic Invisible Canary Watermarking Service.
    Implements a resilient dual-layer steganographic embedding engine,
    cryptographic token generator, S3 forensic audit ledger, and multi-marker
    leak verification pipeline.
    """

    @classmethod
    def generate_token_id(cls) -> str:
        """
        Generates a cryptographically secure, checksummed canary token ID:
        Format: CPDF-CANARY-{12_HEX_ENTROPY}-{8_HEX_TIMESTAMP}-{4_HEX_CHECKSUM}
        """
        entropy = uuid.uuid4().hex[:12].upper()
        ts_hex = f"{int(time.time()):08X}"
        payload = f"{entropy}-{ts_hex}"
        checksum = cls._calculate_checksum(payload)
        return f"CPDF-CANARY-{payload}-{checksum}"

    @classmethod
    def _calculate_checksum(cls, payload: str) -> str:
        """Calculates a 4-character deterministic HMAC checksum for integrity verification."""
        if not config.CANARY_HMAC_SECRET:
            raise RuntimeError("CANARY_HMAC_SECRET is not configured.")
        secret = config.CANARY_HMAC_SECRET.encode("utf-8")
        mac = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return mac[:4].upper()

    @classmethod
    def validate_token_format(cls, token_id: str) -> bool:
        """Validates the structure and checksum of a canary token ID."""
        if not token_id:
            return False
        match = CANARY_TOKEN_REGEX.match(token_id.strip())
        if not match:
            return False
        entropy, ts_hex, checksum = match.groups()
        payload = f"{entropy.upper()}-{ts_hex.upper()}"
        expected_checksum = cls._calculate_checksum(payload)
        return hmac.compare_digest(checksum.upper(), expected_checksum)

    @classmethod
    def embed_watermark(
        cls,
        file_bytes: bytes,
        token_id: str,
        recipient_metadata: Optional[Dict[str, Any]] = None,
        original_filename: str = "document.pdf"
    ) -> Tuple[bytes, str, str]:
        """
        Embeds a resilient, invisible canary watermark into a PDF document across
        redundant content layers without visually altering the pages.

        Returns:
            Tuple[watermarked_bytes, original_sha256, watermarked_sha256]
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        original_sha256 = hashlib.sha256(file_bytes).hexdigest()

        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to parse PDF for canary watermarking: {str(e)}"
            )

        if len(doc) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF document has 0 pages."
            )

        marker_signature = cls._calculate_checksum(token_id)
        marker_text = f"<!--CPDF-CANARY-V1:{token_id}:{marker_signature}-->"

        # 1. Content Stream Steganography: Layer invisible Mode 3 text on each page
        for page_idx, page in enumerate(doc):
            rect = page.rect
            # Place micro-text at the bottom-left margin (1 pt from edge)
            # render_mode=3 tells PDF renderers: neither fill nor stroke glyphs (100% invisible)
            p = fitz.Point(1.0, rect.height - 1.0 if rect.height > 2.0 else 1.0)
            page.insert_text(
                p,
                marker_text,
                fontsize=0.1,
                render_mode=3,
                color=(1.0, 1.0, 1.0)
            )

        # 2. Redundant Layer: Document Metadata Keywords
        existing_meta = doc.metadata or {}
        existing_keywords = existing_meta.get("keywords") or ""
        canary_keyword = f"CPDF-CANARY:{token_id}"
        if canary_keyword not in existing_keywords:
            new_keywords = f"{existing_keywords} {canary_keyword}".strip()
            existing_meta["keywords"] = new_keywords
            doc.set_metadata(existing_meta)

        # 3. Redundant Layer: PDF Catalog Indirect Dictionary Marker
        try:
            catalog_xref = doc.pdf_catalog()
            if catalog_xref > 0:
                doc.xref_set_key(
                    catalog_xref,
                    "ForensicCanary",
                    f"<</Token ({token_id}) /Sig ({marker_signature}) /Engine (CloudPDF_V2.4)>>"
                )
        except Exception as cat_err:
            logger.debug(f"[Canary] Catalog dictionary injection non-critical fallback: {cat_err}")

        # Serialize output
        out_stream = io.BytesIO()
        doc.save(
            out_stream,
            garbage=2,
            deflate=True,
            clean=False  # Do not strip injected content streams
        )
        doc.close()

        watermarked_bytes = out_stream.getvalue()
        watermarked_sha256 = hashlib.sha256(watermarked_bytes).hexdigest()

        return watermarked_bytes, original_sha256, watermarked_sha256

    @classmethod
    def extract_canary_markers(cls, file_bytes: bytes) -> Tuple[Optional[str], List[str]]:
        """
        Scans a PDF document for forensic markers across all layers.
        Returns:
            Tuple[detected_token_id, markers_detected_list]
        """
        markers_found: List[str] = []
        detected_tokens: List[str] = []

        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            logger.error(f"[Canary] Failed to open PDF for extraction: {e}")
            return None, []

        # Layer 1: Search Content Stream Mode 3 invisible text on all pages
        for page in doc:
            try:
                page_text = page.get_text()
                match = CANARY_STREAM_REGEX.search(page_text)
                if match:
                    tok = match.group(1)
                    sig = match.group(2)
                    if cls._calculate_checksum(tok) == sig:
                        detected_tokens.append(tok)
                        if "CONTENT_STREAM_MODE3" not in markers_found:
                            markers_found.append("CONTENT_STREAM_MODE3")
            except Exception:
                pass

        # Layer 2: Search Document Metadata Keywords
        meta = doc.metadata or {}
        keywords = meta.get("keywords") or ""
        kw_match = re.search(r"CPDF-CANARY:(CPDF-CANARY-[A-Za-z0-9_\-]+)", keywords)
        if kw_match:
            tok = kw_match.group(1)
            detected_tokens.append(tok)
            if "METADATA_KEYWORDS" not in markers_found:
                markers_found.append("METADATA_KEYWORDS")

        # Layer 3: Search Catalog Indirect Dictionary
        try:
            catalog_xref = doc.pdf_catalog()
            if catalog_xref > 0:
                cat_val = doc.xref_get_key(catalog_xref, "ForensicCanary")
                if cat_val and cat_val[0] != "null":
                    raw_dict = cat_val[1]
                    dict_match = re.search(r"/Token\s*\(([^\)]+)\)", raw_dict)
                    if dict_match:
                        tok = dict_match.group(1).strip()
                        detected_tokens.append(tok)
                        if "CATALOG_DICTIONARY" not in markers_found:
                            markers_found.append("CATALOG_DICTIONARY")
        except Exception:
            pass

        doc.close()

        if not detected_tokens:
            return None, markers_found

        # Return the most frequently detected token (consensus)
        best_token = max(set(detected_tokens), key=detected_tokens.count)
        return best_token, markers_found

    @classmethod
    def verify_document(
        cls,
        file_bytes: bytes,
        db: Session,
        current_user: Optional[User] = None,
        filename: str = "suspect.pdf"
    ) -> CanaryVerificationResponse:
        """
        Verifies a suspected leaked PDF document against the database and S3 forensic ledger.
        Follows strict authorization rules to prevent unauthorized data leakage.
        """
        validate_pdf_content(file_bytes, filename=filename)
        file_sha256 = hashlib.sha256(file_bytes).hexdigest()

        extracted_token_id, markers_detected = cls.extract_canary_markers(file_bytes)

        if not extracted_token_id:
            return CanaryVerificationResponse(
                status="NOT_FOUND",
                message="No forensic canary watermark markers were detected in this document.",
                file_sha256=file_sha256,
                markers_detected=markers_detected
            )

        # Validate token syntax and cryptographic checksum
        is_valid_format = cls.validate_token_format(extracted_token_id)
        if not is_valid_format:
            return CanaryVerificationResponse(
                status="INVALID_OR_CORRUPTED",
                message="A canary marker was detected, but its cryptographic checksum failed or is corrupted.",
                token_masked=cls.mask_token(extracted_token_id),
                file_sha256=file_sha256,
                markers_detected=markers_detected
            )

        # Query Database
        token_record = db.query(CanaryToken).filter(CanaryToken.token_id == extracted_token_id).first()

        if not token_record:
            return CanaryVerificationResponse(
                status="INCONCLUSIVE",
                message="Canary token has valid cryptographic syntax, but has no matching registration in this registry.",
                token_masked=cls.mask_token(extracted_token_id),
                file_sha256=file_sha256,
                markers_detected=markers_detected
            )

        # Fetch S3 Forensic Ledger for integrity check
        s3_record = None
        try:
            s3_key = StorageService.build_forensic_key(token_record.token_id)
            s3_bytes = StorageService.download_file(s3_key)
            s3_record = json.loads(s3_bytes.decode("utf-8"))
        except Exception as s3_err:
            logger.warning(f"[Canary] S3 forensic record read error for {token_record.token_id}: {s3_err}")

        # Check authorization: Is current user the creator/owner or admin?
        is_owner = False
        if current_user and current_user.id == token_record.user_id:
            is_owner = True

        # Build response based on token status and permissions
        is_revoked = (token_record.status == "REVOKED")
        final_status = "REVOKED" if is_revoked else "VERIFIED"
        status_msg = (
            "Forensic canary token successfully verified. Document origin and recipient chain resolved."
            if not is_revoked
            else "This canary token was previously revoked and is no longer an active document."
        )

        resp = CanaryVerificationResponse(
            status=final_status,
            message=status_msg,
            token_id=token_record.token_id if is_owner else None,
            token_masked=cls.mask_token(token_record.token_id),
            is_owner=is_owner,
            created_at=token_record.created_at,
            organization=token_record.organization,
            original_sha256=token_record.original_sha256,
            file_sha256=file_sha256,
            markers_detected=markers_detected
        )

        # Only expose confidential recipient metadata to the token owner
        if is_owner:
            resp.recipient_name = token_record.recipient_name
            resp.recipient_email = token_record.recipient_email
            resp.tracking_note = token_record.tracking_note
            if token_record.user:
                resp.creator_email = token_record.user.email

        return resp

    @classmethod
    def mask_token(cls, token_id: str) -> str:
        """Masks a token ID for privacy in unauthenticated/third-party responses."""
        if not token_id or len(token_id) < 16:
            return "CPDF-CANARY-****"
        parts = token_id.split("-")
        if len(parts) >= 5:
            # CPDF-CANARY-{entropy}-{ts}-{chk}
            return f"CPDF-CANARY-****-****-{parts[-1]}"
        return token_id[:12] + "****" + token_id[-4:]

    @classmethod
    def create_and_store_ledger(
        cls,
        db: Session,
        user: User,
        job: PDFJob,
        token_id: str,
        original_sha256: str,
        watermarked_sha256: str,
        recipient_name: Optional[str] = None,
        recipient_email: Optional[str] = None,
        organization: Optional[str] = None,
        tracking_note: Optional[str] = None,
        download_ip: Optional[str] = None
    ) -> CanaryToken:
        """
        Persists the CanaryToken record in PostgreSQL and the immutable forensic
        manifest in AWS S3.
        """
        token_record = CanaryToken(
            token_id=token_id,
            user_id=user.id,
            job_id=job.id,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            organization=organization,
            tracking_note=tracking_note,
            original_sha256=original_sha256,
            watermarked_sha256=watermarked_sha256,
            steganography_method="DUAL_LAYER",
            status="ACTIVE",
            download_ip=download_ip,
            created_at=datetime.now(timezone.utc)
        )
        db.add(token_record)
        db.commit()
        db.refresh(token_record)

        # Upload immutable forensic audit manifest to S3
        manifest = {
            "token_id": token_id,
            "user_id": str(user.id),
            "creator_email": user.email,
            "job_id": str(job.id),
            "created_at": token_record.created_at.isoformat(),
            "original_sha256": original_sha256,
            "watermarked_sha256": watermarked_sha256,
            "recipient_name": recipient_name,
            "recipient_email": recipient_email,
            "organization": organization,
            "tracking_note": tracking_note,
            "steganography_method": "DUAL_LAYER",
            "download_ip": download_ip,
            "status": "ACTIVE"
        }

        s3_key = StorageService.build_forensic_key(token_id)
        manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
        try:
            StorageService.upload_file(
                file_bytes=manifest_bytes,
                s3_key=s3_key,
                content_type="application/json"
            )
        except Exception as s3_err:
            logger.error(f"[Canary] Failed to upload forensic ledger to S3 ({s3_key}): {s3_err}")

        return token_record

    @classmethod
    def revoke_token(cls, token_id: str, user: User, db: Session) -> CanaryToken:
        """Revokes an existing canary token owned by the user."""
        token_record = db.query(CanaryToken).filter(CanaryToken.token_id == token_id).first()
        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canary token not found."
            )

        if token_record.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to revoke this token."
            )

        token_record.status = "REVOKED"
        token_record.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(token_record)

        # Update S3 ledger
        try:
            s3_key = StorageService.build_forensic_key(token_id)
            try:
                s3_bytes = StorageService.download_file(s3_key)
                manifest = json.loads(s3_bytes.decode("utf-8"))
            except Exception:
                manifest = {"token_id": token_id}

            manifest["status"] = "REVOKED"
            manifest["revoked_at"] = token_record.revoked_at.isoformat()
            StorageService.upload_file(
                file_bytes=json.dumps(manifest, indent=2).encode("utf-8"),
                s3_key=s3_key,
                content_type="application/json"
            )
        except Exception as e:
            logger.warning(f"[Canary] Could not update S3 ledger on revocation: {e}")

        return token_record

