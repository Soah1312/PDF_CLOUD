import io
import zipfile
import pytest
import pypdf
import fitz
from PIL import Image
from fastapi import HTTPException, status

from app.services.pdf_engine import pdf_engine


def make_dummy_pdf(num_pages: int = 1, text: str = "Test Page") -> bytes:
    """Helper to generate a clean multi-page test PDF in-memory."""
    doc = fitz.open()
    for i in range(1, num_pages + 1):
        page = doc.new_page(width=595, height=842)  # A4
        page.insert_text(fitz.Point(100, 100), f"{text} - Page {i}", fontsize=20)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def make_dummy_image(color: str = "red", width: int = 200, height: int = 200) -> bytes:
    """Helper to generate a test JPEG image."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_merge_pdfs():
    pdf1 = make_dummy_pdf(1, "Document One")
    pdf2 = make_dummy_pdf(2, "Document Two")

    merged = pdf_engine.merge_pdfs([("doc1.pdf", pdf1), ("doc2.pdf", pdf2)])
    reader = pypdf.PdfReader(io.BytesIO(merged))
    assert len(reader.pages) == 3


def test_split_pdf_all_pages():
    pdf = make_dummy_pdf(3, "Split Test")
    zip_bytes, fname, ctype = pdf_engine.split_pdf(pdf, "test.pdf")

    assert ctype == "application/zip"
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        namelist = zf.namelist()
        assert len(namelist) == 3
        assert "test_page_1.pdf" in namelist
        assert "test_page_2.pdf" in namelist
        assert "test_page_3.pdf" in namelist


def test_split_pdf_custom_range():
    pdf = make_dummy_pdf(5, "Range Test")
    # Single range group
    out_bytes, fname, ctype = pdf_engine.split_pdf(pdf, "test.pdf", page_ranges="2-4")
    assert ctype == "application/pdf"
    reader = pypdf.PdfReader(io.BytesIO(out_bytes))
    assert len(reader.pages) == 3


def test_split_pdf_extract_pages():
    pdf = make_dummy_pdf(5, "Extract Test")
    out_bytes, fname, ctype = pdf_engine.split_pdf(pdf, "test.pdf", extract_pages=[1, 3, 5])
    assert ctype == "application/pdf"
    reader = pypdf.PdfReader(io.BytesIO(out_bytes))
    assert len(reader.pages) == 3


def test_rotate_pdf():
    pdf = make_dummy_pdf(2, "Rotate Test")
    rotated = pdf_engine.rotate_pdf(pdf, angle=90, page_numbers=[1])
    reader = pypdf.PdfReader(io.BytesIO(rotated))
    assert reader.pages[0].rotation == 90
    assert reader.pages[1].rotation == 0


def test_protect_pdf():
    pdf = make_dummy_pdf(1, "Protect Test")
    password = "SecretPassword123"
    protected = pdf_engine.protect_pdf(pdf, password=password)

    # Reading without password should fail or indicate encryption
    reader = pypdf.PdfReader(io.BytesIO(protected))
    assert reader.is_encrypted

    # Decrypt with correct password
    assert reader.decrypt(password) > 0
    assert len(reader.pages) == 1


def test_compress_pdf():
    pdf = make_dummy_pdf(2, "Compress Test")
    compressed, stats = pdf_engine.compress_pdf(pdf, level="medium")

    assert len(compressed) > 0
    assert "original_size_bytes" in stats
    assert "compressed_size_bytes" in stats
    assert "compression_ratio_pct" in stats


def test_watermark_pdf():
    pdf = make_dummy_pdf(2, "Watermark Test")
    watermarked = pdf_engine.watermark_pdf(
        pdf,
        text="CONFIDENTIAL",
        font_size=32,
        opacity=0.4,
        rotation=45,
        color="#FF0000"
    )

    reader = pypdf.PdfReader(io.BytesIO(watermarked))
    assert len(reader.pages) == 2


def test_pdf_to_images():
    pdf = make_dummy_pdf(2, "Images Test")
    zip_bytes, fname, ctype = pdf_engine.pdf_to_images(pdf, img_format="png", dpi=100)

    assert ctype == "application/zip"
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        namelist = zf.namelist()
        assert len(namelist) == 2
        assert any(n.endswith(".png") for n in namelist)


def test_images_to_pdf():
    img1 = make_dummy_image("blue", 150, 150)
    img2 = make_dummy_image("green", 150, 150)

    pdf_bytes = pdf_engine.images_to_pdf([("img1.jpg", img1), ("img2.jpg", img2)])
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2


def test_pdf_to_word():
    pdf = make_dummy_pdf(1, "Docx Conversion Test")
    docx_bytes = pdf_engine.pdf_to_word(pdf)
    assert docx_bytes.startswith(b"PK\x03\x04")


def test_word_to_pdf_handling():
    # Corrupt or invalid word file raises 400 or 422
    try:
        pdf_engine.word_to_pdf(b"not a valid word file", "invalid.docx")
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY)


def test_word_to_pdf_real_conversion():
    import docx
    d = docx.Document()
    d.add_heading("Test Conversion", level=0)
    d.add_paragraph("This is a paragraph converted to PDF.")
    buf = io.BytesIO()
    d.save(buf)
    docx_bytes = buf.getvalue()

    pdf_bytes = pdf_engine.word_to_pdf(docx_bytes, "proposal.docx")
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 0


def test_word_to_pdf_docs_extension():
    import docx
    d = docx.Document()
    d.add_paragraph("Testing .docs extension conversion.")
    buf = io.BytesIO()
    d.save(buf)
    docx_bytes = buf.getvalue()

    pdf_bytes = pdf_engine.word_to_pdf(docx_bytes, "proposal.docs")
    assert pdf_bytes.startswith(b"%PDF-")

