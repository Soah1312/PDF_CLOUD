# CloudPDF Studio — "The Bindery"

> **Enterprise-grade, cloud-native PDF processing, forensic document watermarking, and automated pipelining platform.**  
> Built with a **Dual-Access Architecture**, Amazon Cognito authentication, Amazon RDS PostgreSQL, Amazon S3 storage, FastAPI backend on AWS EC2, and Cloudflare Worker proxy/edge hosting.

---

## 🏛 System Architecture

CloudPDF Studio employs a distributed, cloud-native architecture separating edge delivery, volatile compute, identity management, and isolated object storage:

```mermaid
flowchart TD
    User["Client Browser / Mobile PWA"] -->|"HTTPS / Edge"| CF["Cloudflare Worker (Static Assets & API Proxy)"]
    
    subgraph Cloudflare["Edge Tier (Cloudflare)"]
        CF -->|"Serves SPA & PWA Shell"| Static["Vite + React Build (/dist)"]
        CF -->|"Proxies /api/* (Preserves Headers & 307 Redirects)"| EC2Proxy["Worker Proxy"]
    end
    
    subgraph AWS["AWS Cloud Infrastructure (ap-south-1)"]
        EC2Proxy -->|"HTTP (Port 8000)"| FastAPI["FastAPI Application Server (AWS EC2)"]
        
        FastAPI -->|"Verify JWT RS256 Tokens"| Cognito["Amazon Cognito (User Pools)"]
        FastAPI -->|"Relational Data & Workflows"| RDS["Amazon RDS (PostgreSQL)"]
        FastAPI -->|"Presigned Uploads & Encrypted Blobs"| S3["Amazon S3 (Private Bucket)"]
        
        subgraph Engine["In-Memory Execution Engine"]
            PyMuPDF["PyMuPDF (fitz)"]
            PyPDF["pypdf"]
            CanaryEngine["Forensic Steganography Engine"]
            PipelineEngine["RAM Pipelining Engine"]
        end
        FastAPI --> Engine
    end
    
    S3 -.->|"Direct 307 Presigned Download Stream"| User
```

### Component Breakdown

| Layer | Technology | Infrastructure | Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | React 18, Vite 5, Tailwind CSS | Cloudflare Worker Assets | "The Bindery" print-shop UI, PWA shell, touch-first ergonomics |
| **Edge Proxy** | Cloudflare Worker (`worker.js`) | Cloudflare Global Network | Single-domain proxy, CORS elimination, cache prevention, 307 preservation |
| **Compute / API** | FastAPI, Python 3.10 | AWS EC2 (Amazon Linux 2023) | High-throughput in-memory document processing, systemd daemon |
| **Authentication** | Amazon Cognito User Pools | AWS Managed Identity | JWT authentication, user registration, MFA/confirmation flows |
| **Persistence** | PostgreSQL 16 | Amazon RDS | User accounts, job records, canary tokens, and workflow blueprints |
| **File Storage** | Amazon S3 | AWS S3 (`cloudpdf-studio-storage-2026`) | Encrypted, prefix-isolated document storage with presigned lifecycle |

---

## 🔒 Dual-Access Model & Security Boundaries

CloudPDF Studio implements a strict separation of privileges between anonymous visitors and authenticated vault members:

```mermaid
flowchart LR
    Request["Incoming Request"] --> AuthCheck{"Has Bearer JWT?"}
    
    AuthCheck -->|"No"| GuestFlow["Guest Visitor Tier"]
    AuthCheck -->|"Yes"| MemberFlow["Authenticated Member Tier"]
    
    subgraph Guest["Guest Security Boundary"]
        GuestFlow --> GuestID["X-Guest-Session-ID Header"]
        GuestID --> RAMCompute["Volatile RAM Processing"]
        RAMCompute --> GuestS3["S3: guest/{session_id}/ (24h Auto-Expire)"]
        RAMCompute --> GuestZero["Zero Permanent Retention Guarantee"]
    end
    
    subgraph Member["Member Security Boundary"]
        MemberFlow --> CognitoVerify["Cognito Token Verification"]
        CognitoVerify --> MemberRDS["RDS User & Quota Lookup"]
        MemberRDS --> MemberS3["S3: users/{cognito_sub}/ (AES-256)"]
        MemberRDS --> VaultFeatures["Canary Tokens, Workflows & Document Vault"]
    end
```

| Security Dimension | Guest Visitor Tier | Authenticated Member Tier |
| :--- | :--- | :--- |
| **Authentication** | None (Immediate, zero-friction access) | Amazon Cognito JWT (`Authorization: Bearer <token>`) |
| **Identity Token** | Ephemeral UUID (`X-Guest-Session-ID`) | Subject UUID (`sub`) synced to PostgreSQL `users` table |
| **Storage Prefix** | `guest/{session_id}/raw/` & `processed/` | `users/{cognito_sub}/raw/` & `processed/` |
| **Retention Policy** | Auto-expiring; purged after 24 hours | Persistent cloud retention until explicitly removed |
| **Storage Quota** | 0 MB permanent allowance | 500 MB member quota with real-time meter |
| **Forensic Canary Tokens**| Not available | Full creation, embedding, audit, and revocation |
| **Workflow Studio** | Single-run temporary execution | Persistent pipeline blueprints saved to RDS |
| **Document Vault** | In-memory output delivery | Encrypted cloud library with in-browser PDF preview |

---

## 🛠 Features & PDF Capabilities

### 1. Core PDF Processing Engine
All processing operations run in volatile RAM namespaces with zero disk retention for guest jobs:

* **Merge PDF Documents** (`pypdf`): Interleaves and combines multiple PDF documents with drag-and-drop or touch-ordered sequencing.
* **Split & Extract Pages** (`pypdf`): Dual-mode interface supporting visual scissor cut points or tap-to-select page picker with range compilation (`1-3, 5, 8-12`).
* **Rotate Folios** (`pypdf`): Orthogonal rotation (90°, 180°, 270°) with stream structure preservation.
* **Protect & Encrypt** (`pypdf`): Standard AES-256 encryption with optional permission controls (printing, copying). Zero passphrase logging.
* **Stream Compression** (`PyMuPDF` / `fitz`): Three optimization calibrations (`low`, `medium`, `high`) featuring font subsetting, stream deflation, and image downsampling.
* **Watermark Application** (`PyMuPDF` / `fitz`): Visual text stamps with opacity (0.1–1.0), rotation (-90° to 90°), and custom hex color calibration.
* **PDF to Image Plates** (`PyMuPDF`, `Pillow`): High-resolution PNG or JPEG rasterization at 100, 150, or 300 DPI bundled in a ZIP container.
* **Images to PDF** (`img2pdf`, `Pillow`): Compiles image sets (PNG, JPEG) into standardized single-file PDF folios.
* **PDF to Word DOCX** (`pdf2docx`): Extracts layout, typography, and tabular flow into editable `.docx` manuscripts.
* **Word to PDF** (`soffice` headless): Typesets Microsoft Word documents to PDF via headless LibreOffice with sandboxed temporary directory cleanup.

---

### 2. Forensic Canary Watermarking System

An invisible document tracking system that embeds cryptographic steganographic tokens directly into PDF content streams to detect and trace source leaks:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Document Owner
    participant API as Canary API Engine
    participant S3 as Amazon S3
    participant RDS as PostgreSQL
    actor Leaker as Unauthorized Recipient

    Admin->>API: Upload PDF + Recipient Metadata (Name, Email, Org)
    API->>API: Generate Cryptographic Token & Compute Original SHA-256
    API->>API: Embed Invisible Markers (Zero-Width Steganography + Micro-offsets)
    API->>API: Compute Watermarked Document SHA-256
    API->>RDS: Record Token Metadata & Forensic Hashes
    API->>S3: Archive Master Record in forensic/watermark_records/
    API-->>Admin: Deliver Watermarked PDF for Distribution

    Note over Admin,Leaker: Leaked document is recovered in the wild
    Admin->>API: Submit Recovered PDF to /api/v1/canary/verify
    API->>API: Extract Steganographic Token Stream
    API->>RDS: Query Token Record by Hash & ID
    API-->>Admin: Audit Report: Recipient Identity, Timestamps, Tamper Status
```

* **Invisible Steganography**: Uses zero-width Unicode sequences and character-level typographic micro-offsets invisible to standard document readers.
* **Cryptographic Signatures**: Every token carries an HMAC-SHA256 signature generated with a persistent production secret (`CANARY_HMAC_SECRET`).
* **Tamper Resistance**: Verifies both original and watermarked document SHA-256 digests to detect alterations.
* **Revocation Ledger**: Canary tokens can be revoked at any time via the Cloud Vault ledger, immediately updating subsequent forensic audit outputs.

---

### 3. Automated Workflow Studio

A visual pipelining canvas allowing users to chain up to 10 PDF operations sequentially in a single memory namespace:

* **Zero Re-upload Execution**: Documents pass directly between operations in RAM without round-tripping to client storage.
* **Custom Blueprint Persistence**: Members can save named pipeline recipes (e.g., *"Clean & Secure Distribution"*: Compress $\to$ Watermark $\to$ Protect) to PostgreSQL.
* **Telemetry & Execution Trace**: Real-time status reporting per step (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`) with step execution time in milliseconds.

---

### 4. Cloud Vault & Interactive Folio Preview

* **Encrypted Cloud Library**: Centralized ledger of all member-processed folios backed by Amazon S3 SSE-S3 encryption.
* **In-Browser Folio Preview** (`DocumentPreviewModal.jsx`): Click any document to open a high-DPI canvas viewer with page-by-page browsing, zoom in/out/reset, touch swipe gestures, and an archival metadata drawer.
* **Optimistic Deletion with 5s Undo**: Instantly frees workspace clutter while offering a 5-second countdown toast to undo remote deletion.
* **Batch Operations**: Multi-select documents for bulk download or batch removal.

---

### 5. Mobile & Touch Ergonomics

* **First-Class Mobile Layout**: Optimized for viewports from 360px up to 4K displays.
* **Ergonomic Safe Areas**: Native iOS/Android notch and home-indicator handling (`env(safe-area-inset-*)`).
* **Fixed Bottom Bar**: 56px bottom navigation with auto-hide logic when the virtual keyboard is engaged.
* **Camera Document Capture**: Direct `<input capture="environment" />` trigger for snapping physical folios into the Images-to-PDF pipeline.
* **Haptic Touch & Screen Wake Lock**: Vibrates on drag operations (`navigator.vibrate(10)`) and prevents device screen sleep during processing via the Screen Wake Lock API.
* **PWA Standalone Mode**: Configured with `manifest.webmanifest` and a zero-persistence Service Worker (`sw.js`) that strictly caches static assets while bypassing all user documents.

---

## 🎨 "The Bindery" Design System

The visual design is inspired by traditional bookbinding print shops, eschewing generic AI SaaS tropes (blue/purple glows, glassmorphism) in favor of warm, tactile, paper-and-ink aesthetics:

```text
Tokens:
  --paper:       #F1E9DA   /* Main page ground */
  --vellum:      #FAF6EC   /* Raised cards & panels */
  --kraft:       #E4D7BE   /* Recessed workbench zones */
  --ink:         #241B14   /* High-contrast body typography */
  --ink-soft:    #5C4F42   /* Secondary annotations */
  --rule:        #D5C6A8   /* 1px hairline boundary rules */
  --red:         #D9441F   /* Primary press action & highlights */
  --moss:        #4A6B3A   /* Archival confirmation & success */
  --marigold:    #F0B429   /* Selection active indicator */
  --cyan:        #27467A   /* Focus rings & links */

Typography:
  Display: Gloock (Editorial serif)
  Body:    Schibsted Grotesk (Clean humanist sans)
  Metrics: Martian Mono (Technical data, folios & byte stamps)
```

---

## 🗄 Amazon S3 Storage Hierarchy

All objects are isolated by tenant prefix with AWS Block Public Access enabled and SSE-S3 encryption:

```text
cloudpdf-studio-storage-2026/
├── guest/
│   └── {session_id}/
│       ├── raw/                 # Ephemeral uploads (24-hour expiration)
│       └── processed/           # Ephemeral outputs
├── users/
│   └── {cognito_sub}/
│       ├── raw/                 # Original member folios
│       └── processed/           # Refined outputs (persistent)
└── forensic/
    └── watermark_records/       # Steganographic canary metadata
```

---

## 📡 REST API Reference

### Health & Identity
| Method | Path | Summary | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | PostgreSQL, S3, and SSM health check | Public |
| `GET` | `/api/v1/auth/config` | Cognito client ID & authority config | Public |
| `GET` | `/api/v1/auth/me` | Authenticated member profile & storage | Bearer JWT |
| `POST` | `/api/v1/auth/sync` | Synchronize Cognito profile into PostgreSQL | Bearer JWT |
| `GET` | `/api/v1/auth/session-context` | Inspect caller access tier and quotas | Public / Guest / Member |

### Document Vault
| Method | Path | Summary | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/files/upload` | Upload document to S3 storage prefix | Guest / Member |
| `GET` | `/api/v1/files` | List documents owned by caller | Guest / Member |
| `GET` | `/api/v1/files/{file_id}` | Fetch document details & presigned URL | Owner |
| `GET` | `/api/v1/files/{file_id}/download` | Stream or 307 redirect to presigned URL | Owner |
| `DELETE` | `/api/v1/files/{file_id}` | Delete document from S3 and PostgreSQL | Owner |

### PDF Processing
| Method | Path | Summary | Parameters |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/pdf/merge` | Combine multiple PDF files | `files` (multipart) |
| `POST` | `/api/v1/pdf/split` | Split pages or extract ranges | `file`, `page_ranges` |
| `POST` | `/api/v1/pdf/rotate` | Rotate pages | `file`, `angle` (90, 180, 270) |
| `POST` | `/api/v1/pdf/protect` | Encrypt PDF with AES-256 | `file`, `password`, `allow_printing` |
| `POST` | `/api/v1/pdf/compress` | Optimize streams and downsample | `file`, `level` (low, medium, high) |
| `POST` | `/api/v1/pdf/watermark` | Stamp visible text watermark | `file`, `watermark_text`, `opacity`, `rotation` |
| `POST` | `/api/v1/pdf/to-images` | Render pages to PNG/JPEG ZIP | `file`, `format`, `dpi` |
| `POST` | `/api/v1/pdf/from-images` | Compile image set into PDF | `files` (multipart) |
| `POST` | `/api/v1/pdf/to-word` | Extract layout to DOCX | `file` |
| `POST` | `/api/v1/pdf/from-word` | Typeset DOCX to PDF | `file` |

### Forensic Canary & Workflows
| Method | Path | Summary | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/canary/embed` | Embed invisible canary watermark | Member |
| `POST` | `/api/v1/canary/verify` | Audit recovered document for canary token | Public / Member |
| `GET` | `/api/v1/canary/tokens` | List generated canary tokens | Member |
| `POST` | `/api/v1/canary/tokens/{token_id}/revoke` | Revoke a forensic canary token | Member |
| `GET` | `/api/v1/workflows` | List saved pipeline blueprints | Member |
| `POST` | `/api/v1/workflows` | Create a new pipeline blueprint | Member |
| `POST` | `/api/v1/workflows/run` | Execute multi-step sequential pipeline | Guest / Member |

---

## 🗄 Database Schema & Migrations

Database schema migrations are managed through **Alembic**:

```mermaid
erDiagram
    USERS ||--o{ PDF_JOBS : "owns"
    USERS ||--o{ CANARY_TOKENS : "creates"
    USERS ||--o{ SAVED_WORKFLOWS : "authors"
    SAVED_WORKFLOWS ||--o{ WORKFLOW_EXECUTIONS : "runs"

    USERS {
        uuid id PK
        string cognito_sub UK
        string email
        string subscription_tier
        bigint storage_used_bytes
        timestamp created_at
    }

    PDF_JOBS {
        uuid id PK
        uuid user_id FK
        string session_id
        string original_filename
        string action_type
        bigint file_size_bytes
        bigint output_file_size_bytes
        string s3_input_key
        string s3_output_key
        string status
        timestamp expires_at
        timestamp created_at
    }

    CANARY_TOKENS {
        uuid id PK
        uuid user_id FK
        string token_id UK
        string hmac_signature
        string original_file_hash
        string watermarked_file_hash
        string recipient_name
        string recipient_email
        string organization
        string tracking_note
        boolean is_revoked
        timestamp created_at
    }

    SAVED_WORKFLOWS {
        uuid id PK
        uuid user_id FK
        string name
        string description
        json steps
        timestamp created_at
        timestamp updated_at
    }

    WORKFLOW_EXECUTIONS {
        uuid id PK
        uuid workflow_id FK
        uuid user_id FK
        string status
        json step_results
        timestamp started_at
        timestamp completed_at
    }
```

### Alembic Migration Revision Chain

```text
0001_initial_schema
       └── 0002_add_stage2_cols
              └── 0003_add_canary_and_workflows
```

Apply migrations:
```bash
cd backend
alembic upgrade head
```

---

## ⚡ Quick Start & Development

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- PostgreSQL (or local SQLite for dev)
- LibreOffice (for Word to PDF operations)

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (.env)
DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudpdf
CANARY_HMAC_SECRET=your_cryptographically_random_secret_here
AWS_DEFAULT_REGION=ap-south-1

# Apply database migrations
alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Swagger UI available at: `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Run unit tests
npm test

# Build production bundle
npm run build
```
Frontend development server available at: `http://localhost:5173`

### 3. Deploy Frontend with Cloudflare Wrangler

```bash
cd frontend
npm run build
npx wrangler deploy
```

---

## 🧪 Automated Testing

The codebase includes test suites spanning the PDF engine, storage abstraction, security isolation, and edge proxying:

```bash
# Run backend pytest suite (45 tests)
$env:PYTHONPATH="backend"
.\backend\venv\Scripts\python.exe -m pytest backend/tests -v

# Run frontend Cloudflare Worker proxy tests (7 tests)
npm test --prefix frontend
```

### Test Coverage Highlights
* `test_canary.py`: Cryptographic token signing, tamper detection, recipient metadata preservation, and revocation.
* `test_workflows.py`: Pipeline execution, execution limits, step sequence validation, and blueprint persistence.
* `test_pdf_engine.py`: Functional verification of all 10 PDF operations with corrupt stream handling.
* `test_storage.py` & `test_storage_production.py`: Multi-tenant prefix isolation, path traversal rejection, and presigned redirect preservation.
* `worker.test.js`: Cloudflare edge proxy header forwarding, 307 presigned preservation, and no-cache enforcement.

---

## 📜 Production Operations

* **AWS EC2 Directory**: `/opt/cloudpdf`
* **Python Virtualenv**: `/home/ec2-user/cloudpdf-venv`
* **Systemd Daemon**: `cloudpdf.service` (`sudo systemctl restart cloudpdf`)
* **AWS RDS PostgreSQL**: AWS RDS Multi-AZ PostgreSQL 16
* **Remote Management**: AWS Systems Manager (SSM) Session Manager (zero open inbound SSH ports)
