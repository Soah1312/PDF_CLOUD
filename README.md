# CloudPDF Studio (AWS Cloud Edition)

> **Cloud-native PDF processing and automation platform with Dual-Access Architecture, Amazon Cognito authentication, PostgreSQL (RDS) persistence, Amazon S3 storage, and AWS SSM Parameter Store dynamic configuration.**

---

## 🌟 Architecture & Dual-Access Model

CloudPDF Studio is engineered with an enterprise **Dual-Access Model**:

| Capability | Guest Visitor Mode | Authenticated Member Mode |
| :--- | :--- | :--- |
| **Authentication** | None (Immediate ad-hoc access) | Amazon Cognito User Pools (JWT RS256) |
| **Identity Persistence** | Ephemeral session IDs (`X-Guest-Session-ID`) | PostgreSQL / Amazon RDS (`users` table) |
| **File Storage** | Temporary scratch storage (`guest/{session_id}/`) | Persistent Amazon S3 Document Vault (`users/{sub}/`) |
| **Retention Policy** | Auto-expiring (Strict 24-hour retention) | Persistent cloud retention until member deletion |
| **Forensic Watermarking** | Not Available | Invisible Canary Watermarking with Leak Telemetry |
| **Pipelines & Workflows** | Single action execution | Multi-step saved pipelines (`SavedWorkflow` in RDS) |
| **Storage Allocation** | 0 MB persistent | 500 MB cloud quota with live meter |

---

## 🚀 Implemented PDF Processing Engine (Stage 2)

All 10 core PDF processing capabilities are fully implemented and verified:

1. **Merge PDF Documents** (`pypdf`):
   - Combines multiple PDF streams in arbitrary order.
   - Preserves original documents, validates structure, and handles encrypted PDFs.
2. **Split & Extract Pages** (`pypdf`):
   - Supports page range expressions (`1-3, 5, 7-9`), individual page extraction, or bursting entire documents into a ZIP archive.
3. **Rotate PDF Pages** (`pypdf`):
   - Clockwise rotation (90°, 180°, 270°) for selected pages or whole documents with stream preservation.
4. **Protect & Encrypt PDF** (`pypdf`):
   - Standard AES encryption with user passwords. Zero password logging or persistence.
5. **PDF Compression Engine** (`PyMuPDF` / `fitz`):
   - Three optimization tiers (`low`, `medium`, `high`) with garbage collection, stream deflation, and image downsampling.
   - Reports original size, compressed size, and percentage saved.
6. **Watermark PDF** (`PyMuPDF` / `fitz`):
   - Flexible text watermarks with custom text, font size, opacity (0.1–1.0), rotation angle (-90° to 90°), placement, and hex color.
7. **PDF to Images** (`pdf2image`, `Pillow`, `PyMuPDF`):
   - High-fidelity PNG or JPEG rendering at selectable DPI (100, 150, 300) packaged in ZIP archives.
   - Fallback rendering via PyMuPDF ensures functionality even when external Poppler binaries are absent.
8. **Images to PDF** (`img2pdf`, `Pillow`):
   - Combines JPEG and PNG image sets into standardized single-file PDFs with custom ordering.
9. **PDF to Word DOCX** (`pdf2docx`):
   - Converts layout and text flow into editable `.docx` documents.
10. **Word to PDF** (`LibreOffice` headless):
    - Subprocess execution via `soffice --headless --convert-to pdf` with temporary directory cleanup and graceful missing-binary handling.

---

## 🗄 Storage Architecture (Amazon S3)

Target Bucket: `cloudpdf-studio-storage-2026`  
Region: `ap-south-1`  
Security: Block Public Access enabled, SSE-S3 encryption, IAM Role-based access (`cloudpdf-ec2-ssm-role` / `CloudPDF-S3-Access`).

```text
cloudpdf-studio-storage-2026/
    guest/
        {session_id}/
            raw/             # Original guest uploads
            processed/       # Processed guest outputs (24h expiry)
    users/
        {cognito_user_id}/
            raw/             # Original member documents
            processed/       # Processed member documents (persistent)
    forensic/
        watermark_records/   # Steganographic canary tracking data
```

---

## 📡 REST API Endpoints

### File Management
- `POST /api/v1/files/upload` — Upload document to user/guest S3 prefix
- `GET /api/v1/files` — List stored documents for active caller
- `GET /api/v1/files/{file_id}` — Get document metadata & presigned URL
- `GET /api/v1/files/{file_id}/download` — Stream or redirect to presigned download URL
- `DELETE /api/v1/files/{file_id}` — Delete object from S3 and PostgreSQL, updating storage quota

### PDF Engine Operations
- `POST /api/v1/pdf/merge` — Merge multiple PDF files with ordering
- `POST /api/v1/pdf/split` — Split or extract pages
- `POST /api/v1/pdf/rotate` — Rotate pages by 90°, 180°, 270°
- `POST /api/v1/pdf/protect` — Encrypt PDF with password
- `POST /api/v1/pdf/compress` — Compress and optimize PDF
- `POST /api/v1/pdf/watermark` — Embed customizable text watermark
- `POST /api/v1/pdf/to-images` — Convert pages into PNG/JPEG ZIP archive
- `POST /api/v1/pdf/from-images` — Combine images into single PDF
- `POST /api/v1/pdf/to-word` — Convert PDF to editable Word DOCX
- `POST /api/v1/pdf/from-word` — Convert Word DOCX to PDF

### Processing History
- `GET /api/v1/history` — List processing history
- `GET /api/v1/history/{job_id}` — Job status and execution telemetry

### System & Auth
- `GET /api/health` — Cloud health monitor (PostgreSQL RDS, AWS SSM, Cognito)
- `GET /api/v1/auth/config` — Public Cognito parameters for SPA
- `GET /api/v1/auth/me` — Authenticated member profile
- `POST /api/v1/auth/sync` — Sync Cognito profile into RDS
- `GET /api/v1/auth/session-context` — Inspect caller access tier

---

## ⚡ Quick Start & Development

### 1. Backend Setup

```bash
cd backend

# Create & activate venv
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive Swagger Documentation: `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Build or start development server
npm run dev
# Or build for production
npm run build
```

Frontend application available at: `http://localhost:5173`

---

## 🧪 Automated Testing

A comprehensive automated test suite covers the PDF processing engine, storage isolation, and API endpoints:

```bash
# Set PYTHONPATH to backend directory and run pytest
$env:PYTHONPATH="backend"
.\backend\venv\Scripts\python.exe -m pytest backend/tests -v
```

**Test Coverage Highlights**:
- `test_pdf_engine.py`: Tests all 10 operations (Merge, Split, Rotate, Protect, Compress, Watermark, PDF to Images, Images to PDF, PDF to Word, Word to PDF).
- `test_storage.py`: Tests upload, download, delete, presigned URLs, member isolation, guest isolation, and path traversal rejection.
- `test_api_endpoints.py`: End-to-end guest PDF merge, split, compression, 24h expiration checks, and multi-tenant security isolation.
