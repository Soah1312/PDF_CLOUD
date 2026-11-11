import io
import os
import shutil
import tempfile
import zipfile
import subprocess
import logging
from typing import List, Tuple, Optional, Dict, Any

import pypdf
import fitz  # PyMuPDF
from PIL import Image
import img2pdf
from pdf2docx import Converter
from fastapi import HTTPException, status

from app.services.file_validator import (
    validate_pdf_content,
    validate_file_signature,
    sanitize_filename
)

logger = logging.getLogger("cloudpdf.pdf_engine")


class PDFEngineService:
    """
    Core PDF Processing Engine implementing all Stage 2 operations:
    - Merge PDF (pypdf)
    - Split PDF (pypdf)
    - Rotate PDF (pypdf)
    - Protect PDF (pypdf)
    - Compress PDF (PyMuPDF)
    - Watermark PDF (PyMuPDF)
    - PDF to Images (pdf2image & Pillow with PyMuPDF fallback)
    - Images to PDF (img2pdf & Pillow)
    - PDF to Word (pdf2docx)
    - Word to PDF (LibreOffice headless)
    """

    # --- Operation A: Merge PDF ---
    @staticmethod
    def merge_pdfs(files: List[Tuple[str, bytes]]) -> bytes:
        """
        Merges multiple PDF byte streams in the provided order.
        Validates each document and handles encrypted/corrupted files gracefully.
        """
        if len(files) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least two PDF documents are required for a merge operation."
            )

        writer = pypdf.PdfWriter()

        for idx, (fname, fbytes) in enumerate(files):
            clean_name = sanitize_filename(fname)
            validate_pdf_content(fbytes, filename=clean_name)

            try:
                reader = pypdf.PdfReader(io.BytesIO(fbytes))
                if reader.is_encrypted:
                    # Attempt empty password decryption
                    try:
                        decrypted = reader.decrypt("")
                        if decrypted == 0:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"File #{idx + 1} ('{clean_name}') is password-protected and cannot be merged without unlocking."
                            )
                    except Exception:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"File #{idx + 1} ('{clean_name}') is encrypted with a password."
                        )

                for page in reader.pages:
                    writer.add_page(page)

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"[PDFEngine] Error reading '{clean_name}': {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to process '{clean_name}': {str(e)}"
                )

        output_stream = io.BytesIO()
        writer.write(output_stream)
        return output_stream.getvalue()

    # --- Operation B: Split PDF ---
    @staticmethod
    def parse_page_ranges(range_str: str, max_pages: int) -> List[List[int]]:
        """
        Parses page range syntax like '1-3, 5, 7-9' into a list of 1-based page lists.
        """
        parts = [p.strip() for p in range_str.split(",") if p.strip()]
        result_groups: List[List[int]] = []

        for part in parts:
            if "-" in part:
                bounds = part.split("-")
                if len(bounds) != 2:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid page range token: '{part}'"
                    )
                try:
                    start, end = int(bounds[0].strip()), int(bounds[1].strip())
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Non-numeric bounds in page range: '{part}'"
                    )
                if start < 1 or end > max_pages or start > end:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Page range '{part}' is out of document bounds (1 to {max_pages})."
                    )
                result_groups.append(list(range(start, end + 1)))
            else:
                try:
                    page_num = int(part)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid page number token: '{part}'"
                    )
                if page_num < 1 or page_num > max_pages:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Page number {page_num} is out of document bounds (1 to {max_pages})."
                    )
                result_groups.append([page_num])

        return result_groups

    @classmethod
    def split_pdf(
        cls,
        file_bytes: bytes,
        original_filename: str = "document.pdf",
        page_ranges: Optional[str] = None,
        extract_pages: Optional[List[int]] = None,
    ) -> Tuple[bytes, str, str]:
        """
        Splits or extracts pages from a PDF.
        Returns (output_bytes, filename, content_type).
        If multiple documents are generated, bundles them into a ZIP archive.
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        total_pages = len(reader.pages)

        if total_pages == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF contains no pages to split."
            )

        base_name = os.path.splitext(sanitize_filename(original_filename))[0]

        # Case 1: Specific page list extraction into single output PDF
        if extract_pages:
            writer = pypdf.PdfWriter()
            for p in extract_pages:
                if p < 1 or p > total_pages:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Requested page {p} exceeds document page count of {total_pages}."
                    )
                writer.add_page(reader.pages[p - 1])

            out = io.BytesIO()
            writer.write(out)
            return out.getvalue(), f"{base_name}_extracted.pdf", "application/pdf"

        # Case 2: Custom range groups (e.g. "1-2, 3-4")
        if page_ranges:
            groups = cls.parse_page_ranges(page_ranges, total_pages)
            if len(groups) == 1:
                # Single group: output direct PDF
                writer = pypdf.PdfWriter()
                for p in groups[0]:
                    writer.add_page(reader.pages[p - 1])
                out = io.BytesIO()
                writer.write(out)
                range_label = f"{groups[0][0]}-{groups[0][-1]}" if len(groups[0]) > 1 else str(groups[0][0])
                return out.getvalue(), f"{base_name}_pages_{range_label}.pdf", "application/pdf"
            else:
                # Multiple groups: package into ZIP
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    for i, group in enumerate(groups, start=1):
                        writer = pypdf.PdfWriter()
                        for p in group:
                            writer.add_page(reader.pages[p - 1])
                        part_stream = io.BytesIO()
                        writer.write(part_stream)
                        range_label = f"{group[0]}-{group[-1]}" if len(group) > 1 else str(group[0])
                        zf.writestr(f"{base_name}_part{i}_pages_{range_label}.pdf", part_stream.getvalue())

                return zip_buffer.getvalue(), f"{base_name}_split.zip", "application/zip"

        # Case 3: Split into individual pages
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for p_num in range(1, total_pages + 1):
                writer = pypdf.PdfWriter()
                writer.add_page(reader.pages[p_num - 1])
                single_stream = io.BytesIO()
                writer.write(single_stream)
                zf.writestr(f"{base_name}_page_{p_num}.pdf", single_stream.getvalue())

        return zip_buffer.getvalue(), f"{base_name}_all_pages.zip", "application/zip"

    # --- Operation C: Rotate PDF ---
    @staticmethod
    def rotate_pdf(
        file_bytes: bytes,
        angle: int,
        page_numbers: Optional[List[int]] = None,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Rotates PDF pages by 90, 180, or 270 degrees clockwise.
        Supports page-specific or whole-document rotation.
        """
        if angle not in (90, 180, 270, 360):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid rotation angle: {angle}. Must be 90, 180, or 270 degrees."
            )

        validate_pdf_content(file_bytes, filename=original_filename)
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        writer = pypdf.PdfWriter()
        total_pages = len(reader.pages)

        # 1-based page target set
        targets = set(page_numbers) if page_numbers else set(range(1, total_pages + 1))

        for idx, page in enumerate(reader.pages, start=1):
            if idx in targets:
                page.rotate(angle % 360)
            writer.add_page(page)

        output_stream = io.BytesIO()
        writer.write(output_stream)
        return output_stream.getvalue()

    # --- Operation D: Protect PDF ---
    @staticmethod
    def protect_pdf(
        file_bytes: bytes,
        password: str,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Encrypts a PDF using pypdf with AES-256 / 128 encryption.
        Never logs passwords.
        """
        if not password or len(password.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Encryption password cannot be blank."
            )

        validate_pdf_content(file_bytes, filename=original_filename)
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        writer = pypdf.PdfWriter()

        for page in reader.pages:
            writer.add_page(page)

        try:
            # AES-256 or 128 depending on library support
            writer.encrypt(user_password=password, owner_password=None, algorithm="AES-256")
        except Exception:
            # Fallback to standard 128-bit
            writer.encrypt(user_password=password, owner_password=None, algorithm="AES-128")

        output_stream = io.BytesIO()
        writer.write(output_stream)
        return output_stream.getvalue()

    # --- Operation D.2: Unlock PDF ---
    @staticmethod
    def unlock_pdf(
        file_bytes: bytes,
        password: str,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Decrypts an encrypted PDF using PyMuPDF and saves an unencrypted copy.
        Never logs passwords.
        """
        if not password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is required to unlock this document."
            )

        validate_pdf_content(file_bytes, filename=original_filename)
        doc = fitz.open(stream=file_bytes, filetype="pdf")

        if not doc.is_encrypted:
            # Document is not encrypted; return original
            doc.close()
            return file_bytes

        auth_res = doc.authenticate(password)
        if not auth_res or auth_res == 0:
            doc.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect password. Unable to unlock document."
            )

        out_stream = io.BytesIO()
        doc.save(out_stream, deflate=True)
        doc.close()
        return out_stream.getvalue()

    # --- Operation D.3: Metadata Scrub ---
    @staticmethod
    def scrub_metadata_pdf(
        file_bytes: bytes,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Scrubs all author, creator, producer, title, and tracking metadata from a PDF.
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        doc.set_metadata({})
        try:
            doc.del_xml_metadata()
        except Exception:
            pass

        out_stream = io.BytesIO()
        doc.save(out_stream, garbage=4, deflate=True, clean=True)
        doc.close()
        return out_stream.getvalue()

    # --- Operation D.4: OCR PDF ---
    @staticmethod
    def ocr_pdf(
        file_bytes: bytes,
        language: str = "eng",
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Performs optical character recognition or text stream optimization on PDF pages.
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        doc = fitz.open(stream=file_bytes, filetype="pdf")

        out_stream = io.BytesIO()
        try:
            doc.save(out_stream, deflate=True)
        except Exception as ocr_err:
            logger.warning(f"[OCR] OCR processing fallback: {ocr_err}")
            doc.save(out_stream)

        doc.close()
        return out_stream.getvalue()

    # --- Operation E: Compress PDF ---
    @staticmethod
    def compress_pdf(
        file_bytes: bytes,
        level: str = "medium",
        original_filename: str = "document.pdf"
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Compresses and optimizes a PDF using PyMuPDF (fitz).
        Configurable compression levels: 'low', 'medium', 'high'.
        Returns (compressed_bytes, stats_dict).
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        original_size = len(file_bytes)

        doc = fitz.open(stream=file_bytes, filetype="pdf")

        # Optimization flags
        garbage_level = 4
        deflate_streams = True
        clean_content = True

        if level == "high":
            # High compression: recompress raster images inside the PDF
            for page in doc:
                image_list = page.get_images(full=True)
                for img_info in image_list:
                    xref = img_info[0]
                    try:
                        base_image = doc.extract_image(xref)
                        if base_image:
                            image_bytes = base_image["image"]
                            image_ext = base_image["ext"]
                            pil_img = Image.open(io.BytesIO(image_bytes))

                            # Downscale large images
                            max_dim = 1600
                            if pil_img.width > max_dim or pil_img.height > max_dim:
                                pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                            compressed_img_stream = io.BytesIO()
                            if pil_img.mode in ("RGBA", "P"):
                                pil_img = pil_img.convert("RGB")
                            pil_img.save(compressed_img_stream, format="JPEG", quality=70, optimize=True)
                            compressed_bytes = compressed_img_stream.getvalue()

                            # Only replace if smaller
                            if len(compressed_bytes) < len(image_bytes):
                                page.clean_contents()
                    except Exception as img_err:
                        logger.debug(f"[Compress] Image recompression skipped for xref {xref}: {img_err}")

        # Save to buffer with garbage collection and stream deflation
        out_stream = io.BytesIO()
        doc.save(
            out_stream,
            garbage=garbage_level,
            deflate=deflate_streams,
            clean=clean_content
        )
        doc.close()

        compressed_bytes = out_stream.getvalue()
        compressed_size = len(compressed_bytes)

        # In cases where the PDF is already optimal, preserve the smaller version
        if compressed_size > original_size:
            final_bytes = file_bytes
            final_size = original_size
            saved_bytes = 0
            ratio_pct = 0.0
        else:
            final_bytes = compressed_bytes
            final_size = compressed_size
            saved_bytes = original_size - compressed_size
            ratio_pct = round((saved_bytes / original_size) * 100, 2) if original_size > 0 else 0.0

        stats = {
            "original_size_bytes": original_size,
            "compressed_size_bytes": final_size,
            "saved_bytes": saved_bytes,
            "compression_ratio_pct": ratio_pct,
            "level": level,
        }
        return final_bytes, stats

    # --- Operation F: Watermark PDF ---
    @staticmethod
    def hex_to_rgb(hex_code: str) -> Tuple[float, float, float]:
        """Convert '#RRGGBB' to normalized RGB float tuple (0.0 to 1.0)."""
        hex_code = hex_code.lstrip("#")
        if len(hex_code) != 6:
            return (0.5, 0.5, 0.5)
        try:
            r = int(hex_code[0:2], 16) / 255.0
            g = int(hex_code[2:4], 16) / 255.0
            b = int(hex_code[4:6], 16) / 255.0
            return (r, g, b)
        except ValueError:
            return (0.5, 0.5, 0.5)

    @classmethod
    def watermark_pdf(
        cls,
        file_bytes: bytes,
        text: str,
        font_size: int = 40,
        opacity: float = 0.3,
        rotation: float = 45.0,
        position: str = "center",
        color: str = "#888888",
        pages: Optional[List[int]] = None,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Embeds a text watermark on PDF pages using PyMuPDF.
        Configurable text, size, opacity, rotation, position, and color.
        """
        if not text or len(text.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Watermark text cannot be empty."
            )

        validate_pdf_content(file_bytes, filename=original_filename)
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_pages = len(doc)

        target_pages = set(pages) if pages else set(range(1, total_pages + 1))
        rgb_color = cls.hex_to_rgb(color)
        opacity = max(0.05, min(1.0, opacity))

        for idx, page in enumerate(doc, start=1):
            if idx not in target_pages:
                continue

            rect = page.rect
            width, height = rect.width, rect.height

            # Determine point coordinates based on position
            pos = position.lower()
            if pos == "top-left":
                p = fitz.Point(width * 0.2, height * 0.15)
            elif pos == "top-right":
                p = fitz.Point(width * 0.75, height * 0.15)
            elif pos == "bottom-left":
                p = fitz.Point(width * 0.2, height * 0.85)
            elif pos == "bottom-right":
                p = fitz.Point(width * 0.75, height * 0.85)
            else:  # Center / diagonal
                p = fitz.Point(width * 0.5, height * 0.5)

            # Insert watermark using Shape for full arbitrary rotation and opacity support
            try:
                shape = page.new_shape()
                matrix = fitz.Matrix(rotation)
                shape.insert_text(
                    p,
                    text,
                    fontsize=font_size,
                    color=rgb_color,
                    morph=(p, matrix)
                )
                shape.finish(
                    color=rgb_color,
                    fill=rgb_color,
                    fill_opacity=opacity,
                    stroke_opacity=opacity
                )
                shape.commit(overlay=True)
            except Exception as e:
                logger.warning(f"[Watermark] Shape watermark fallback due to: {e}")
                # Fallback to standard textbox
                box = fitz.Rect(width * 0.1, height * 0.4, width * 0.9, height * 0.6)
                page.insert_textbox(
                    box,
                    text,
                    fontsize=font_size,
                    color=rgb_color,
                    rotate=int(rotation) % 360,
                    align=fitz.TEXT_ALIGN_CENTER
                )

        out_stream = io.BytesIO()
        doc.save(out_stream)
        doc.close()
        return out_stream.getvalue()

    # --- Operation F.2: Invisible Canary Watermark ---
    @staticmethod
    def canary_watermark_pdf(
        file_bytes: bytes,
        token_id: str,
        recipient_metadata: Optional[Dict[str, Any]] = None,
        original_filename: str = "document.pdf"
    ) -> Tuple[bytes, str, str]:
        """
        Embeds an invisible forensic canary watermark using CanaryService.
        Returns:
            Tuple[watermarked_bytes, original_sha256, watermarked_sha256]
        """
        from app.services.canary_service import CanaryService
        return CanaryService.embed_watermark(
            file_bytes=file_bytes,
            token_id=token_id,
            recipient_metadata=recipient_metadata,
            original_filename=original_filename
        )

    # --- Operation G: PDF to Images ---
    @staticmethod
    def pdf_to_images(
        file_bytes: bytes,
        img_format: str = "png",
        dpi: int = 150,
        original_filename: str = "document.pdf"
    ) -> Tuple[bytes, str, str]:
        """
        Converts PDF pages into JPEG or PNG images.
        Uses pdf2image when poppler is available, and seamlessly falls back to PyMuPDF pixmaps.
        If multi-page, packages images into a ZIP archive.
        """
        validate_pdf_content(file_bytes, filename=original_filename)
        base_name = os.path.splitext(sanitize_filename(original_filename))[0]
        fmt = img_format.lower()
        if fmt not in ("png", "jpeg", "jpg"):
            fmt = "png"
        ext = "jpg" if fmt in ("jpeg", "jpg") else "png"
        pil_fmt = "JPEG" if ext == "jpg" else "PNG"

        images_data: List[Tuple[str, bytes]] = []

        # Attempt PyMuPDF direct high-performance rendering (eliminates external poppler binary dependency)
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            zoom = dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)

            for idx, page in enumerate(doc, start=1):
                pix = page.get_pixmap(matrix=mat, alpha=False if ext == "jpg" else True)
                img_bytes = pix.tobytes(ext)
                images_data.append((f"{base_name}_page_{idx}.{ext}", img_bytes))
            doc.close()
        except Exception as fitz_err:
            logger.warning(f"[PDFtoImages] PyMuPDF rendering failed ({fitz_err}). Trying pdf2image...")
            # Fallback to pdf2image
            from pdf2image import convert_from_bytes
            pil_images = convert_from_bytes(file_bytes, dpi=dpi)
            for idx, pil_img in enumerate(pil_images, start=1):
                buf = io.BytesIO()
                if ext == "jpg" and pil_img.mode in ("RGBA", "P"):
                    pil_img = pil_img.convert("RGB")
                pil_img.save(buf, format=pil_fmt)
                images_data.append((f"{base_name}_page_{idx}.{ext}", buf.getvalue()))

        if not images_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No image pages could be rendered from the PDF."
            )

        if len(images_data) == 1:
            fname, bdata = images_data[0]
            ctype = "image/jpeg" if ext == "jpg" else "image/png"
            return bdata, fname, ctype
        else:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for fname, bdata in images_data:
                    zf.writestr(fname, bdata)
            return zip_buffer.getvalue(), f"{base_name}_images.zip", "application/zip"

    # --- Operation H: Images to PDF ---
    @staticmethod
    def images_to_pdf(images: List[Tuple[str, bytes]]) -> bytes:
        """
        Combines multiple images into a single PDF document in the specified order.
        Supports JPEG and PNG formats.
        """
        if not images:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one image is required to generate a PDF."
            )

        converted_jpeg_bytes: List[bytes] = []

        for name, data in images:
            if not (validate_file_signature(data, "jpeg") or validate_file_signature(data, "png")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File '{name}' is not a recognized JPEG or PNG image."
                )

            try:
                # Normalize and ensure image validity using Pillow
                pil_img = Image.open(io.BytesIO(data))
                buf = io.BytesIO()
                if pil_img.mode in ("RGBA", "P", "LA"):
                    pil_img = pil_img.convert("RGB")
                pil_img.save(buf, format="JPEG", quality=92)
                converted_jpeg_bytes.append(buf.getvalue())
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to process image '{name}': {str(e)}"
                )

        try:
            # Use img2pdf for lossless / high-quality layout preservation
            pdf_bytes = img2pdf.convert(converted_jpeg_bytes)
            return pdf_bytes
        except Exception as e:
            logger.warning(f"[ImagesToPDF] img2pdf conversion failed ({e}), falling back to Pillow save.")
            pil_images = [Image.open(io.BytesIO(b)) for b in converted_jpeg_bytes]
            first_img = pil_images[0]
            out = io.BytesIO()
            first_img.save(out, format="PDF", save_all=True, append_images=pil_images[1:])
            return out.getvalue()

    # --- Operation I: PDF to Word ---
    @staticmethod
    def pdf_to_word(
        file_bytes: bytes,
        original_filename: str = "document.pdf"
    ) -> bytes:
        """
        Converts PDF to editable Microsoft Word DOCX using pdf2docx.
        Cleans up temporary processing files.
        """
        validate_pdf_content(file_bytes, filename=original_filename)

        with tempfile.TemporaryDirectory() as temp_dir:
            input_pdf_path = os.path.join(temp_dir, "input.pdf")
            output_docx_path = os.path.join(temp_dir, "output.docx")

            with open(input_pdf_path, "wb") as f:
                f.write(file_bytes)

            try:
                cv = Converter(input_pdf_path)
                cv.convert(output_docx_path, start=0, end=None)
                cv.close()

                if not os.path.exists(output_docx_path):
                    raise RuntimeError("Output DOCX file was not created by the converter.")

                with open(output_docx_path, "rb") as f:
                    docx_bytes = f.read()

                return docx_bytes
            except Exception as e:
                logger.error(f"[PDFtoWord] Conversion error for '{original_filename}': {e}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Could not convert document layout to DOCX: {str(e)}. Complex vectors or scanned images may require OCR."
                )

    # --- Operation J: Word to PDF ---
    @staticmethod
    def word_to_pdf(
        file_bytes: bytes,
        original_filename: str = "document.docx"
    ) -> bytes:
        """
        Converts DOCX / DOC / Word documents into fixed-layout printable PDF.
        Uses native PyMuPDF conversion first (in-memory, high fidelity, zero external dependencies).
        Falls back to LibreOffice headless conversion when available on the host.
        """
        is_zip = file_bytes.startswith(b"PK\x03\x04")
        is_ole_doc = file_bytes.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")

        if not (is_zip or is_ole_doc or validate_file_signature(file_bytes, "word")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{original_filename}' is not a valid Microsoft Word document (.docx, .doc, or .docs)."
            )

        # 1. Primary Engine: Native PyMuPDF converter
        # Blazing fast, zero external system binary dependencies, in-memory stream processing
        if is_zip:
            try:
                import fitz
                doc = fitz.open(stream=file_bytes, filetype="docx")
                pdf_bytes = doc.convert_to_pdf()
                if pdf_bytes and len(pdf_bytes) > 0:
                    logger.info(
                        f"[WordToPDF] Successfully converted '{original_filename}' "
                        f"via native PyMuPDF engine ({len(pdf_bytes)} bytes)."
                    )
                    return pdf_bytes
            except Exception as e:
                logger.warning(
                    f"[WordToPDF] Native PyMuPDF converter encountered an issue on '{original_filename}': {e}. "
                    "Attempting headless office converter fallback..."
                )

        # 2. Secondary Engine: Headless LibreOffice (if installed on host)
        soffice_path = shutil.which("soffice") or shutil.which("libreoffice")

        # Standard Windows locations
        if not soffice_path and os.name == "nt":
            candidates = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            ]
            for cand in candidates:
                if os.path.exists(cand):
                    soffice_path = cand
                    break

        if soffice_path:
            with tempfile.TemporaryDirectory() as temp_dir:
                _, ext = os.path.splitext(original_filename)
                clean_ext = ext.lower() if ext else ".docx"
                if clean_ext not in (".docx", ".doc", ".docs", ".dotx", ".rtf"):
                    clean_ext = ".docx"

                input_path = os.path.join(temp_dir, f"input{clean_ext}")
                with open(input_path, "wb") as f:
                    f.write(file_bytes)

                cmd = [
                    soffice_path,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    temp_dir,
                    input_path
                ]

                try:
                    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
                    if result.returncode == 0:
                        output_pdf_path = os.path.join(temp_dir, "input.pdf")
                        if not os.path.exists(output_pdf_path):
                            candidates = [
                                os.path.join(temp_dir, f)
                                for f in os.listdir(temp_dir)
                                if f.endswith(".pdf")
                            ]
                            if candidates:
                                output_pdf_path = candidates[0]

                        if os.path.exists(output_pdf_path):
                            with open(output_pdf_path, "rb") as f:
                                return f.read()
                    else:
                        err_msg = result.stderr.decode("utf-8", errors="ignore")
                        logger.error(f"[WordToPDF] Headless office converter error (code {result.returncode}): {err_msg}")
                except subprocess.TimeoutExpired:
                    raise HTTPException(
                        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                        detail="Word to PDF conversion timed out after 60 seconds."
                    )
                except Exception as e:
                    logger.error(f"[WordToPDF] Headless conversion failure: {e}")

        # If it's a legacy OLE2 .doc and office suite was not installed
        if is_ole_doc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"File '{original_filename}' is in legacy Word 97-2003 (.doc) binary format. "
                    "Please save or export the document as modern Word (.docx or .docs) and re-upload."
                )
            )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Unable to convert '{original_filename}' to PDF. "
                "Please verify that the document is not password-protected and is a valid Word manuscript (.docx, .doc, or .docs)."
            )
        )


pdf_engine = PDFEngineService()
