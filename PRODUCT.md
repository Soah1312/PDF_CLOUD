# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineers, legal teams, publication managers, and professionals who handle high-stakes PDF operations: merging, splitting, compressing, encrypting, watermarking, format conversions, and forensic document tracking. They need fast, friction-free ad-hoc document processing without forced sign-ups, alongside enterprise-grade authenticated cloud vaults and confidential leak-tracing pipelines when managing sensitive organizational data.

## Product Purpose

CloudPDF Studio — "The Bindery" — is a print-shop workbench document platform built with dual-access architecture. It rejects generic dark AI/SaaS aesthetics in favor of physical craft: warm paper grounds, dense typographic ink, crisp 1px rule lines, and purposeful micro-mechanical motion. It pairs instant zero-friction guest operations with persistent, encrypted AWS cloud storage (S3 + RDS PostgreSQL) and forensic zero-width canary watermarking.

## Positioning

Unlike generic web PDF converters that hoard files on untrusted ad-supported servers or force account creation for basic tasks, CloudPDF Studio operates a true dual-tier architecture on AWS: ephemeral in-memory execution for guest workbench tools, and authenticated AWS Cognito sessions backed by dedicated S3 buckets, RDS PostgreSQL tracking, and zero-width invisible steganographic canary watermarking to trace leaked confidential documents.

## Design Concept: "The Bindery"

- **Aesthetic:** Print-shop workbench. Light, warm, paper-and-ink.
- **Palette:** `--paper` (#F1E9DA), `--vellum` (#FAF6EC), `--kraft` (#E4D7BE), `--ink` (#241B14), `--ink-soft` (#5C4F42), `--rule` (#D5C6A8), `--red` (#D9441F), `--cyan` (#27467A), `--marigold` (#F0B429), `--moss` (#4A6B3A).
- **Typography:** Gloock (display/headlines), Schibsted Grotesk (body/UI), Martian Mono (labels/sizes/stamps/telemetry).
- **Radii & Surfaces:** Snug 6px corners. Flat surfaces bounded by 1px `--rule` lines. Physical ink-offset button shadows. Subtle paper-grain texture.
- **Micro-Interactions:** Marching dashed border, spring drop bounce, FLIP reorder, split scissors cut-line, compress odometer & squash, rubber-stamp thumps ("DONE", "SEALED"), Command Palette (Ctrl+K).

## Operating Context

- Web application accessed on modern desktop and mobile browsers.
- Direct integration with AWS services: EC2 FastAPI backend, RDS PostgreSQL, S3 private buckets, Cognito User Pools.
- Ephemeral guest processing with automatic in-memory lifecycle vs. authenticated member vaults with 500 MB cloud quota.
- Cloudflare Worker hosting the single-page application and proxying `/api/*` to EC2.

## Capabilities and Constraints

- **Confirmed Functionality:**
  - 10 core PDF operations: Merge PDF (`bind`), Split & Extract (`cut`), Compress (`press`), Rotate (`turn`), Protect & Encrypt (`seal`), Watermark (`stamp`), PDF to Images (`render`), Images to PDF (`compile`), PDF to Word (`extract`), Word to PDF (`bind`).
  - Forensic Invisible Canary Watermarking: Zero-width steganographic token embedding for leak tracking in member vaults (`trace` & `audit`).
  - Dual-tier authentication: Guest mode (no login, in-memory volatile sessions) vs. Authenticated Member (Amazon Cognito, persistent S3 storage, RDS job tracking, quota enforcement).
  - Cloud Document Vault (Workspace): Upload, view, presigned S3 URL downloads, optimistic deletion with 5s undo toast, and canary tracking ledger.
  - Visual Pipeline Orchestration (Workflow Studio): Preview and execution of chained multi-step document pipelines.
- **Technical Constraints:**
  - Frontend: React 18 + Vite, Tailwind CSS 3.4, Lucide icons, React Router DOM v6, PDF.js for lazy-rendered thumbnails.
  - Backend: FastAPI on Amazon Linux 2023 EC2, RDS PostgreSQL (`ap-south-1`), Boto3 S3 SigV4 with virtual-hosted addressing.
  - Hosting: Cloudflare Workers frontend routing `/api/*` to EC2 backend.
  - File size limit: 100 MB per file.
