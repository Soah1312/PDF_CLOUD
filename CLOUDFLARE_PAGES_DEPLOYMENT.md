# CloudPDF Studio — Cloudflare Pages Frontend Deployment Guide

This guide details the deployment of the **CloudPDF Studio** React + Vite frontend to **Cloudflare Pages** while maintaining secure, high-performance connectivity to the existing **AWS EC2 backend** (`cloudpdf-server`).

---

## 1. Target Architecture Overview

```text
[ Browser / Client ]
         │
         │ (HTTPS requests to yourdomain.pages.dev)
         ▼
[ Cloudflare Global Anycast Edge (Cloudflare Pages) ]
         │
         ├─► Static Assets & SPA Routes (/assets/*, /, /workspace, /login)
         │   └── Served directly from Cloudflare Global CDN with HTTP 200 SPA fallback
         │
         └─► API Calls (/api/*)
             └── Handled by Cloudflare Pages Function (functions/api/[[path]].js)
                     │
                     │ (Proxied upstream using API_ORIGIN)
                     ▼
             [ AWS EC2 Instance (cloudpdf-server) ]
                     │
                     ▼
             [ Nginx Reverse Proxy (Port 80) ]
                     │
                     ▼
             [ FastAPI Backend (127.0.0.1:8000) ]
                     ├── AWS RDS PostgreSQL (pdfapp)
                     ├── AWS S3 Storage (cloudpdf-studio-storage-2026)
                     └── AWS Cognito User Pool (ap-south-1_gwFz137XV)
```

### Key Architectural Benefits
- **Zero CORS Overhead**: The React frontend and `/api/*` endpoints share the exact same Cloudflare Pages domain origin (`https://<project>.pages.dev`).
- **Global Edge Performance**: Vite-bundled HTML, CSS, JavaScript, and icons are served instantly from 300+ Cloudflare edge data centers.
- **Backend Isolation**: EC2 IP and port details remain unexposed in frontend bundles; the Pages Function uses a secure environment variable (`API_ORIGIN`) to communicate upstream.
- **Direct S3 Downloads**: When downloading processed files, the proxy preserves HTTP 307 redirects to Amazon S3 presigned URLs without buffering or rewriting them.

---

## 2. GitHub Integration & Cloudflare Pages Setup

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation menu, navigate to **Compute (Workers) > Pages**.
3. Click **Create application** > **Pages** > **Connect to Git**.
4. Authorize Cloudflare to access your GitHub account and select the repository:
   - **Repository**: `Soah1312/PDF_CLOUD`
5. Click **Begin setup**.

---

## 3. Build & Deployment Settings

In the **Set up builds and deployments** screen, configure the following values:

| Setting | Required Value | Description |
| :--- | :--- | :--- |
| **Project name** | `cloudpdf-studio` *(or preferred name)* | Subdomain on `pages.dev` |
| **Production branch** | `main` | Continuous deployment branch |
| **Framework preset** | `Vite` *(or None)* | Automatically recognizes Vite layout |
| **Root directory** | `frontend` | Points Cloudflare to the React directory |
| **Build command** | `npm ci && npm run build` | Installs dependencies and runs Vite build |
| **Build output directory** | `dist` | Destination for built production assets |

---

## 4. Environment Variables Configuration

In the Cloudflare Pages deployment screen (under **Environment variables**) or later in **Settings > Environment variables**, add the following production variables:

| Variable Name | Environment | Value | Description |
| :--- | :--- | :--- | :--- |
| `API_ORIGIN` | **Production** & **Preview** | `http://<EC2_PUBLIC_IP>` | The public IP or domain of your AWS EC2 instance. Example: `http://13.126.230.166` |
| `NODE_VERSION` | **Production** & **Preview** | `22` | Specifies Node.js 22 runtime for builds |

> [!IMPORTANT]
> - Do **not** add AWS access keys, RDS passwords, or Cognito client secrets to Cloudflare Pages.
> - The frontend bundle does **not** need `VITE_API_URL` set. When omitted, all Axios calls use relative paths beginning with `/api`, which are routed through the Pages Function.
> - Ensure your EC2 Security Group allows inbound HTTP traffic on port `80` from the internet (or Cloudflare IP ranges).

---

## 5. API Proxy Function Architecture (`functions/api/[[path]].js`)

Cloudflare Pages uses file-based routing for serverless functions. The file [`frontend/functions/api/[[path]].js`](file:///c:/Users/soahf/Desktop/CCL_MINIPROJECT/frontend/functions/api/[[path]].js) handles all `/api/*` requests:

- **Method Preservation**: Forwards `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.
- **Query Parameter Preservation**: Exact query strings (e.g., `/api/v1/files?page=1&status=COMPLETED`) are preserved.
- **Header Forwarding**:
  - `Authorization`: Forwards AWS Cognito JWT bearer tokens.
  - `X-Guest-Session-ID`: Forwards guest isolation tracking tokens.
  - `Content-Type`: Forwards multipart form boundaries for PDF uploads.
  - `CF-Connecting-IP`: Forwarded as `X-Real-IP` and `X-Forwarded-For` for backend audit telemetry.
- **S3 Presigned Redirect Handling (`redirect: 'manual'`)**:
  When the backend triggers a download redirect (`HTTP 307` to S3), the function preserves the `Location` header and passes the redirect directly back to the browser. The client downloads directly from Amazon S3 rather than streaming through Cloudflare Workers.
- **Streaming Payloads**: Supports up to 100 MB multipart file uploads with `duplex: 'half'` streaming.
- **Cache Prevention**: All API responses automatically receive `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` to prevent edge caching of dynamic PDF job states.

---

## 6. Routing and SPA Behavior (`_routes.json`)

To ensure optimal performance and eliminate unnecessary function invocations:

1. **Functions Routing (`_routes.json`)**:
   Located at `frontend/public/_routes.json` (copied to `dist/_routes.json` at build time):
   ```json
   {
     "version": 1,
     "include": [
       "/api/*"
     ],
     "exclude": [
       "/assets/*",
       "/favicon.ico"
     ]
   }
   ```
   This configuration guarantees that **only** `/api/*` executes the Pages Function, while all static assets (`/assets/*`, `.js`, `.css`, images) bypass functions and serve from Cloudflare's global static cache.

2. **React Router SPA Fallback**:
   Because `_routes.json` excludes non-API paths, Cloudflare Pages applies its built-in Single Page Application fallback: any direct browser navigation or page refresh (e.g., `/workspace`, `/login`, `/tool/merge`) automatically serves `index.html` with HTTP 200, allowing client-side React Router to resolve the route seamlessly.

---

## 7. Deployment Verification & Health Checks

Once the build finishes in Cloudflare Pages, verify the deployment using the generated `*.pages.dev` URL (or your custom domain):

### A. Health & Database Connectivity Check
```bash
curl -s https://<your-project>.pages.dev/api/health | jq .
```
Expected output:
```json
{
  "status": "healthy",
  "environment": "production",
  "database_connected": true,
  "ssm_enabled": false,
  "cognito_configured": true,
  "region": "ap-south-1"
}
```

### B. Amazon Cognito Client Configuration
```bash
curl -s https://<your-project>.pages.dev/api/v1/auth/config | jq .
```
Expected output:
```json
{
  "userPoolId": "ap-south-1_gwFz137XV",
  "clientId": "3oij56tppqgoqnvs9dg352fe8t",
  "region": "ap-south-1",
  "isConfigured": true
}
```

### C. SPA Routing & Direct Browser Refresh
Verify that direct navigation to subpages returns `index.html` (HTTP 200) rather than a 404:
```bash
curl -I https://<your-project>.pages.dev/workspace
curl -I https://<your-project>.pages.dev/login
curl -I https://<your-project>.pages.dev/confirm-email
```

### D. Static Asset Delivery & Caching
```bash
curl -I https://<your-project>.pages.dev/assets/index-C-AeRCvo.css
```
Expected response:
- `CF-Cache-Status: HIT` or `MISS` (served by Cloudflare CDN, not function)
- `Cache-Control: public, immutable`

### E. File Download / S3 Presigned URL Redirect Check
```bash
curl -I https://<your-project>.pages.dev/api/v1/files/<FILE_ID>/download
```
Expected response:
- `HTTP/1.1 307 Temporary Redirect`
- `Location: https://cloudpdf-studio-storage-2026.s3.ap-south-1.amazonaws.com/...`

---

## 8. Rollback Procedure

If an issue occurs after deploying to Cloudflare Pages:

### Instant Cloudflare Pages Rollback (Zero Downtime)
1. Go to **Cloudflare Dashboard > Workers & Pages > Pages > cloudpdf-studio**.
2. Click the **Deployments** tab.
3. Locate the previous working deployment.
4. Click the three dots `...` next to that deployment and select **Rollback to this deployment**.
5. Cloudflare will instantly route all traffic back to the selected deployment without rebuilding.

### Fallback to AWS EC2 Nginx Frontend
The existing Nginx configuration on AWS EC2 remains intact at `/etc/nginx/conf.d/cloudpdf.conf`. If you ever need to bypass Cloudflare Pages entirely:
1. Update DNS or point client traffic directly to `http://<EC2_PUBLIC_IP>`.
2. The built frontend assets remain available on EC2 at `/opt/cloudpdf/frontend/dist`.

