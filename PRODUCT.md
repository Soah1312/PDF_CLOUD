# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineers, document managers, and professionals who handle high-stakes PDF operations: merging, splitting, compressing, encrypting, watermarking, format conversions, and forensic document tracking. They need fast, friction-free ad-hoc document processing without forced sign-ups, alongside enterprise-grade authenticated cloud vaults and confidential leak-tracing pipelines when managing sensitive organizational data.

## Product Purpose

CloudPDF Studio is an enterprise-grade, cloud-native PDF intelligence platform built with dual-access architecture. It eliminates bloated desktop software and privacy-invasive ad-supported web converters by pairing instant zero-friction guest operations with persistent, encrypted AWS cloud storage (S3 + RDS PostgreSQL) and forensic steganographic canary watermarking. Success means instantaneous, reliable document operations with provable data security and zero visual noise.

## Positioning

Unlike generic web PDF converters that hoard files on untrusted ad-supported servers or force account creation for basic tasks, CloudPDF Studio operates a true dual-tier architecture on AWS: ephemeral stateless execution for guest utilities, and authenticated AWS Cognito sessions backed by dedicated S3 buckets, RDS PostgreSQL tracking, and zero-width invisible steganographic canary watermarking to trace leaked confidential documents.

## Operating Context

- Web application accessed on modern desktop and mobile browsers.
- Real-time cloud health monitor connected to `/api/health` displaying PostgreSQL (RDS), AWS SSM, Cognito status, and active AWS region (`ap-south-1`).
- Direct integration with AWS services: EC2 FastAPI backend, RDS PostgreSQL, S3 virtual-hosted buckets, Cognito User Pools.
- Ephemeral guest processing with automatic session-based lifecycle vs. authenticated member vaults with 500 MB cloud quota.

## Capabilities and Constraints

- **Confirmed Functionality:**
  - 10 core PDF operations: Merge PDF, Split & Extract, Compress, Rotate (90°/180°/270°), Protect & Encrypt (AES), Watermark (text, opacity, angle, placement), PDF to Images (ZIP export), Images to PDF, PDF to Word (DOCX), Word to PDF.
  - Forensic Invisible Canary Watermarking: Zero-width steganographic token embedding for leak tracking in member vaults.
  - Dual-tier authentication: Guest mode (no login, ephemeral sessions) vs. Authenticated Member (Amazon Cognito, persistent S3 storage, RDS job tracking, quota enforcement).
  - Cloud Document Vault (Workspace): Upload, view, presigned S3 URL downloads, and deletion with quota management.
  - Visual Pipeline Orchestration (Workflow Studio): Preview and execution of chained multi-step document pipelines.
- **Technical Constraints:**
  - Frontend: React 18 + Vite, Tailwind CSS 3.4, Lucide icons, React Router DOM v6.
  - Backend: FastAPI on Amazon Linux 2023 EC2, RDS PostgreSQL (`ap-south-1`), Boto3 S3 SigV4 with virtual-hosted addressing.
  - Hosting: Cloudflare Pages / Workers frontend routing `/api/*` to EC2 Nginx reverse proxy.
  - File size limit: 100 MB per file.

## Brand Commitments

- Product Name: **CloudPDF Studio** (AWS Cloud-Native PDF Intelligence).
- Tone & Voice: Architectural, precise, authoritative, high-trust, and minimal. Strictly professional and engineered, not playful or casual.
- Absolute design requirements: Zero AI slop (no generic purple-to-indigo gradients, no card-in-card nesting, no gray text on colored backgrounds, no gratuitous glassmorphic halos, no rounded icon tiles above headings, no Inter-as-display).

## Evidence on Hand

- Fully operational backend with live RDS PostgreSQL, S3 bucket `cloudpdf-studio-storage-2026`, and Cognito User Pool `ap-south-1_gwFz137XV`.
- Live deployed frontend and EC2 FastAPI instance with working `/api/health` telemetry.
- 10 functional tool endpoints and end-to-end verified S3 presigned downloads.

## Product Principles

1. **Utility First, Zero Friction:** Ad-hoc guest tools must be accessible in one click with immediate drag-and-drop execution; authentication is an upgrade, not a barrier.
2. **Transparent Integrity:** Live backend status, connection states, encryption details, and processing stages are always explicitly communicated to the user.
3. **Engineering Rigor:** Every control, metric, and data field reflects real state and real measurements; no superficial vanity decoration or synthetic marketing fluff.
4. **Calm Precision:** The interface recedes into an unobtrusive, razor-sharp workspace that prioritizes document content and workflow focus over visual shouting.

