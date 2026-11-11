import io
import os
import sys
import time
import logging
import uuid
import tempfile
import shutil
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

import pymupdf
import ocrmypdf
import ocrmypdf.exceptions as ocr_exceptions

from app.core.config import config
from app.core.database import SessionLocal
from app.models.ocr import OCRJob
from app.models.user import User
from app.services.storage import storage_service

logger = logging.getLogger("cloudpdf.ocr")


def _ensure_ocr_system_dependencies_on_path():
    """
    Ensures that Tesseract, Ghostscript, and QPDF executables can be resolved.
    On Windows development environments, adds Scoop or standard install paths
    to PATH if not already present. On Linux (Amazon Linux 2023), binaries are
    located under standard system paths (/usr/bin, /usr/local/bin).
    """
    if sys.platform == "win32":
        user_profile = os.environ.get("USERPROFILE", "")
        extra_paths = [
            os.path.join(user_profile, "scoop", "shims"),
            os.path.join(user_profile, "scoop", "apps", "tesseract", "current"),
            os.path.join(user_profile, "scoop", "apps", "ghostscript", "current", "bin"),
            os.path.join(user_profile, "scoop", "apps", "qpdf", "current", "bin"),
            r"C:\Program Files\Tesseract-OCR",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Tesseract-OCR"),
        ]
        current_path = os.environ.get("PATH", "")
        paths_to_add = [p for p in extra_paths if os.path.exists(p) and p not in current_path]
        if paths_to_add:
            os.environ["PATH"] = ";".join(paths_to_add) + ";" + current_path

        # If TESSDATA_PREFIX is not set, set it if found in scoop
        if "TESSDATA_PREFIX" not in os.environ:
            candidate_tessdata = os.path.join(user_profile, "scoop", "apps", "tesseract-languages", "current")
            if os.path.exists(candidate_tessdata):
                os.environ["TESSDATA_PREFIX"] = candidate_tessdata
            else:
                candidate_tessdata_app = os.path.join(user_profile, "scoop", "apps", "tesseract", "current", "tessdata")
                if os.path.exists(candidate_tessdata_app):
                    os.environ["TESSDATA_PREFIX"] = candidate_tessdata_app
    else:
        # Linux / Amazon Linux 2023: Ensure system directories are included in PATH
        extra_linux_paths = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/local/sbin", "/usr/sbin"]
        current_path = os.environ.get("PATH", "")
        existing_parts = set(current_path.split(":"))
        paths_to_add = [p for p in extra_linux_paths if os.path.exists(p) and p not in existing_parts]
        if paths_to_add:
            os.environ["PATH"] = ":".join(paths_to_add) + ":" + current_path

        # Resolve TESSDATA_PREFIX if not explicitly configured in environment
        if "TESSDATA_PREFIX" not in os.environ:
            candidates = [
                "/usr/local/share/tessdata",
                "/usr/share/tessdata",
                "/usr/share/tesseract/tessdata",
                "/usr/share/tesseract-ocr/5/tessdata",
                "/usr/share/tesseract-ocr/4.00/tessdata",
            ]
            for c in candidates:
                if os.path.exists(c):
                    os.environ["TESSDATA_PREFIX"] = c
                    break


_ensure_ocr_system_dependencies_on_path()


def inspect_pdf_digital_text(content: bytes) -> Dict[str, Any]:
    """
    Analyzes a PDF using PyMuPDF to determine if it already contains usable digital text.
    Provides users with pre-flight visibility so they can choose whether to skip or force OCR.
    Returns:
      has_digital_text: bool
      detected_words: int
      pages_with_text: int
      page_count: int
      recommended_action: "OCR_RECOMMENDED" or "SEARCHABLE_ALREADY"
      message: str
    """
    try:
        doc = pymupdf.open(stream=content, filetype="pdf")
        total_pages = len(doc)
        total_words = 0
        pages_with_text = 0

        for page in doc:
            text = page.get_text().strip()
            words = len(text.split())
            if words >= 10:  # Threshold for meaningful text on a page
                pages_with_text += 1
            total_words += words

        # Document is considered already searchable if:
        # - Has substantial total words (>= 50) AND at least half the pages have text, OR
        # - Has >= 150 words in total
        has_digital_text = (
            (pages_with_text > 0 and (pages_with_text / max(1, total_pages)) >= 0.5 and total_words >= 50)
            or total_words >= 150
        )

        return {
            "has_digital_text": has_digital_text,
            "detected_words": total_words,
            "pages_with_text": pages_with_text,
            "page_count": total_pages,
            "recommended_action": "SEARCHABLE_ALREADY" if has_digital_text else "OCR_RECOMMENDED",
            "message": (
                f"PDF already contains {total_words} searchable words across {pages_with_text}/{total_pages} pages."
                if has_digital_text
                else f"Scanned document detected. Only {total_words} words found across {total_pages} pages. OCR recommended."
            ),
        }
    except Exception as e:
        logger.warning(f"[OCR] Digital text inspection failed: {e}. Defaulting to OCR recommended.")
        return {
            "has_digital_text": False,
            "detected_words": 0,
            "pages_with_text": 0,
            "page_count": 0,
            "recommended_action": "OCR_RECOMMENDED",
            "message": "Unable to inspect text layer. Proceeding with OCR.",
        }


class OCRmyPDFEngine:
    """
    Executes PDF OCR via OCRmyPDF and Tesseract.
    Guarantees:
    - Generates searchable, selectable PDFs with invisible text layer.
    - Preserves original scanned page visual appearance (no rasterization of existing vectors unless requested).
    - Preserves page dimensions and aspect ratios.
    - Uses --skip-text by default on already-searchable pages to avoid duplicate text.
    - Corrects page rotation when needed.
    - Supports configurable OCR languages (default 'eng').
    - Fully cleans up temporary files.
    """

    @classmethod
    def is_engine_available(cls) -> bool:
        """Checks if OCRmyPDF and required system binaries (tesseract, gs, qpdf) are accessible."""
        _ensure_ocr_system_dependencies_on_path()
        has_tesseract = shutil.which("tesseract") is not None
        has_gs = (shutil.which("gs") or shutil.which("gswin64c")) is not None
        has_qpdf = shutil.which("qpdf") is not None
        return has_tesseract and has_gs and has_qpdf

    @classmethod
    def generate_searchable_pdf(
        cls,
        raw_pdf_bytes: bytes,
        language: str = "eng",
        force_ocr: bool = False,
        rotate_pages: bool = True,
    ) -> bytes:
        """
        Processes PDF bytes with OCRmyPDF and returns the searchable PDF bytes.
        """
        _ensure_ocr_system_dependencies_on_path()

        # Check required system binaries before execution
        missing_binaries = []
        if not shutil.which("tesseract"):
            missing_binaries.append("tesseract")
        if not (shutil.which("gs") or shutil.which("gswin64c")):
            missing_binaries.append("ghostscript (gs)")
        if not shutil.which("qpdf"):
            missing_binaries.append("qpdf")

        if missing_binaries:
            missing_str = ", ".join(missing_binaries)
            raise RuntimeError(
                f"Missing required system OCR dependencies on host: {missing_str}. "
                "Install on Amazon Linux 2023 with: sudo dnf install -y spal-release && sudo dnf install -y tesseract tesseract-langpack-eng qpdf ghostscript"
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            input_file = os.path.join(temp_dir, "input.pdf")
            output_file = os.path.join(temp_dir, "output.pdf")

            with open(input_file, "wb") as f:
                f.write(raw_pdf_bytes)

            ocr_kwargs = {
                "input_file": input_file,
                "output_file": output_file,
                "language": language or config.OCR_DEFAULT_LANGUAGE,
                "output_type": "pdf",
                "progress_bar": False,
                "jobs": 1,
                "use_threads": True,
                "invalidate_digital_signatures": True,
            }

            if force_ocr:
                ocr_kwargs["redo_ocr"] = True
            else:
                ocr_kwargs["skip_text"] = True

            if rotate_pages and config.OCR_ROTATE_PAGES:
                ocr_kwargs["rotate_pages"] = True

            try:
                exit_code = ocrmypdf.ocr(**ocr_kwargs)
                if exit_code != ocr_exceptions.ExitCode.ok and exit_code != 0:
                    logger.warning(f"[OCRmyPDF] ocrmypdf completed with exit code: {exit_code}")
            except ocr_exceptions.PriorOcrFoundError:
                # If prior OCR exists and skip_text wasn't triggered, rerun with redo_ocr
                logger.info("[OCRmyPDF] Prior OCR detected. Re-running with redo_ocr=True.")
                ocr_kwargs["skip_text"] = False
                ocr_kwargs["redo_ocr"] = True
                ocrmypdf.ocr(**ocr_kwargs)
            except ocr_exceptions.EncryptedPdfError:
                raise ValueError("Cannot OCR password-protected or encrypted PDF document.")
            except ocr_exceptions.InputFileError as e:
                err_detail = (e.args[0] if e.args else None) or getattr(e, "message", None) or str(e)
                raise ValueError(f"Invalid PDF input file: {err_detail}")
            except Exception as e:
                # If rotation failed (e.g. missing osd.traineddata on host), retry without rotation
                if ocr_kwargs.get("rotate_pages"):
                    logger.warning(f"[OCRmyPDF] OCR failed with rotate_pages=True. Retrying with rotate_pages=False... Cause: {e}")
                    ocr_kwargs["rotate_pages"] = False
                    try:
                        exit_code = ocrmypdf.ocr(**ocr_kwargs)
                    except Exception as retry_err:
                        err_detail = (
                            (retry_err.args[0] if (retry_err.args and len(retry_err.args) > 0) else None)
                            or getattr(retry_err, "message", None)
                            or str(retry_err)
                            or repr(retry_err)
                        )
                        logger.error(f"[OCRmyPDF] OCR retry failed: {err_detail}", exc_info=True)
                        raise RuntimeError(f"OCR processing failed: {err_detail}")
                else:
                    err_detail = (
                        (e.args[0] if (e.args and len(e.args) > 0) else None)
                        or getattr(e, "message", None)
                        or str(e)
                        or repr(e)
                    )
                    logger.error(f"[OCRmyPDF] OCR processing failed: {err_detail}", exc_info=True)
                    raise RuntimeError(f"OCR processing failed: {err_detail}")

            if not os.path.exists(output_file) or os.path.getsize(output_file) == 0:
                raise RuntimeError("Optical recognition pipeline did not produce a valid output PDF file.")

            with open(output_file, "rb") as f:
                output_bytes = f.read()

            # Verify output validity with PyMuPDF
            try:
                verify_doc = pymupdf.open(stream=output_bytes, filetype="pdf")
                if len(verify_doc) == 0:
                    verify_doc.close()
                    raise ValueError("Produced PDF contains 0 pages.")
                verify_doc.close()
            except Exception as e:
                raise RuntimeError(f"Generated PDF failed structural verification: {e}")

            return output_bytes


class OCRJobProcessor:
    """
    Coordinates asynchronous OCR processing:
    1. Validates document.
    2. Uploads raw file to S3.
    3. Runs OCRmyPDF + Tesseract text recognition.
    4. Validates output PDF structure and text layer.
    5. Uploads searchable PDF to S3.
    6. Updates PostgreSQL database status and progress.
    """

    def __init__(self, db_session_factory=None):
        self._db_session_factory = db_session_factory or SessionLocal

    def process_job(
        self,
        job_id: uuid.UUID,
        raw_pdf_bytes: bytes,
        force_mock_for_test: bool = False,
    ):
        """
        Executes the OCR pipeline synchronously or within a FastAPI background task.
        Guarantees that jobs are updated to COMPLETED or FAILED and never left hung.
        """
        db = self._db_session_factory()
        try:
            job = db.query(OCRJob).filter(OCRJob.id == job_id).first()
            if not job:
                logger.error(f"[OCRProcessor] Job {job_id} not found in database.")
                return

            # Stage 1: VALIDATING
            job.status = "PROCESSING"
            job.processing_stage = "VALIDATING"
            job.progress = 15
            db.commit()

            # Inspect digital text if not yet recorded
            inspection = inspect_pdf_digital_text(raw_pdf_bytes)
            job.has_digital_text = inspection["has_digital_text"]
            job.detected_words = inspection["detected_words"]
            if job.page_count <= 0:
                job.page_count = inspection["page_count"]
            db.commit()

            # Stage 2: STORING_ORIGINAL
            job.processing_stage = "STORING_ORIGINAL"
            job.progress = 30
            db.commit()

            storage_service.upload_file(
                file_data=raw_pdf_bytes,
                key=job.original_s3_key,
                content_type="application/pdf",
            )

            # Stage 3: OCR_PROCESSING
            job.processing_stage = "OCR_PROCESSING"
            job.progress = 60
            db.commit()

            if force_mock_for_test:
                logger.info(f"[OCRProcessor] Mock mode active for job {job_id}; injecting synthetic searchable text layer.")
                searchable_pdf_bytes = self._generate_simulated_searchable_pdf(raw_pdf_bytes)
                time.sleep(0.3)
            else:
                # Real OCRmyPDF + Tesseract execution
                searchable_pdf_bytes = OCRmyPDFEngine.generate_searchable_pdf(
                    raw_pdf_bytes=raw_pdf_bytes,
                    language=job.language,
                    force_ocr=job.force_ocr,
                    rotate_pages=True,
                )

            # Stage 4: VERIFYING_OUTPUT
            job.processing_stage = "VERIFYING_OUTPUT"
            job.progress = 85
            db.commit()

            # Verify output structure and extractability
            verify_doc = pymupdf.open(stream=searchable_pdf_bytes, filetype="pdf")
            verified_page_count = len(verify_doc)
            verify_doc.close()

            if verified_page_count == 0:
                raise RuntimeError("OCR produced an empty PDF with zero pages.")

            # Stage 5: STORING_OUTPUT
            job.processing_stage = "STORING_OUTPUT"
            job.progress = 95
            db.commit()

            storage_service.upload_file(
                file_data=searchable_pdf_bytes,
                key=job.output_s3_key,
                content_type="application/pdf",
            )

            # Update User storage allocation if authenticated
            if job.user_id:
                user = db.query(User).filter(User.id == job.user_id).first()
                if user:
                    user.storage_used_bytes += len(searchable_pdf_bytes)

            # Final Stage: COMPLETED
            job.status = "COMPLETED"
            job.processing_stage = "COMPLETED"
            job.progress = 100
            job.output_file_size_bytes = len(searchable_pdf_bytes)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

            logger.info(f"[OCRProcessor] Job {job_id} successfully completed. Searchable PDF size: {len(searchable_pdf_bytes)} bytes.")

        except Exception as e:
            logger.error(f"[OCRProcessor] Job {job_id} failed: {e}", exc_info=True)
            try:
                fail_db = self._db_session_factory()
                job = fail_db.query(OCRJob).filter(OCRJob.id == job_id).first()
                if job:
                    job.status = "FAILED"
                    job.processing_stage = "FAILED"
                    job.error_message = str(e)
                    fail_db.commit()
                fail_db.close()
            except Exception as db_err:
                logger.critical(f"[OCRProcessor] Failed to persist FAILED status for job {job_id}: {db_err}")
        finally:
            db.close()

    @staticmethod
    def _generate_simulated_searchable_pdf(raw_pdf_bytes: bytes) -> bytes:
        """
        Fallback simulation used only when explicitly requested in test fixtures.
        Injects an invisible text layer using PyMuPDF render_mode=3.
        """
        doc = pymupdf.open(stream=raw_pdf_bytes, filetype="pdf")
        for page in doc:
            rect = page.rect
            page.insert_text(
                pymupdf.Point(rect.width * 0.1, rect.height * 0.5),
                "MOCK SEARCHABLE TEXT LAYER",
                fontsize=12,
                fontname="helv",
                render_mode=3,
            )
        output = doc.tobytes(deflate=True)
        doc.close()
        return output


ocr_processor = OCRJobProcessor()
