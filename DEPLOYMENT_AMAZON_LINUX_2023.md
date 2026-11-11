# CloudPDF Studio — Amazon Linux 2023 EC2 Deployment Guide

This guide contains the exact, reproducible commands to deploy the **CloudPDF Studio** backend on Amazon Linux 2023 with Python 3.12 and Amazon RDS PostgreSQL.

---

## 1. Target AWS Infrastructure Reference

| Component | AWS Resource Identifier | Details |
| :--- | :--- | :--- |
| **AWS Region** | `ap-south-1` | Asia Pacific (Mumbai) |
| **EC2 Instance** | `cloudpdf-server` | t3.micro, Amazon Linux 2023 |
| **IAM Instance Role** | `cloudpdf-ec2-ssm-role` | SSM Session Manager + `CloudPDF-S3-Access` |
| **Amazon RDS** | `cloudpdf-postgres.cvckagyk6fse.ap-south-1.rds.amazonaws.com` | PostgreSQL 16, DB: `pdfapp`, Port: 5432 |
| **RDS Master User** | `cloudpdf_admin` | Requires `sslmode=require` |
| **Amazon S3** | `cloudpdf-studio-storage-2026` | SSE-S3 encrypted, Block Public Access enabled |
| **Cognito User Pool** | `ap-south-1_gwFz137XV` | Client ID: `3oij56tppqgoqnvs9dg352fe8t` |

---

## 2. Connect to EC2 Instance

Connect via AWS Systems Manager (SSM) Session Manager without needing SSH keys or exposed port 22:

```bash
# Using AWS CLI with SSM Plugin:
aws ssm start-session --target <EC2_INSTANCE_ID> --region ap-south-1

# Or connect via the AWS Management Console:
# EC2 > Instances > cloudpdf-server > Connect > Session Manager
```

Once connected, switch to `ec2-user` and update OS packages:
```bash
sudo su - ec2-user
sudo dnf update -y
```

---

## 3. Install Python 3.12 and System Build Dependencies

Install Python 3.12, development headers, compiler tools, and Poppler (required by `pdf2image`):

```bash
sudo dnf install -y \
  python3.12 \
  python3.12-pip \
  python3.12-devel \
  git \
  gcc \
  gcc-c++ \
  libffi-devel \
  openssl-devel \
  libjpeg-turbo-devel \
  zlib-devel \
  poppler-utils
```

Verify Python and Poppler versions:
```bash
python3.12 --version
pdftoppm -v
```

---

## 3.1 Install OCR System Dependencies (Tesseract, Ghostscript, QPDF)

OCRmyPDF requires **Tesseract OCR**, **Ghostscript (`gs`)**, and **QPDF**.
On Amazon Linux 2023, install the official AWS SPAL (Supplementary Packages for Amazon Linux) repository to obtain `tesseract`, `tesseract-langpack-eng`, `ghostscript`, and `qpdf`:

```bash
# 1. Install SPAL repository (EPEL 9 packages built for AL2023)
sudo dnf install -y spal-release

# 2. Install Tesseract, English language pack, Ghostscript, and QPDF
sudo dnf install -y tesseract tesseract-langpack-eng ghostscript qpdf

# 3. Verify installations
tesseract --version
gs --version
qpdf --version
```

---

## 4. Install Headless LibreOffice on Amazon Linux 2023

Amazon Linux 2023 core repositories do not include LibreOffice. Install the official Document Foundation RPMs to support headless Word-to-PDF (`pdf2docx` / `soffice`) conversion:

```bash
# 1. Install required graphical and font libraries
sudo dnf install -y \
  cairo \
  cups-libs \
  libSM \
  libXcomposite \
  libXdamage \
  libXext \
  libXfixes \
  libXinerama \
  libXrandr \
  libXrender \
  mesa-libGL

# 2. Download and unpack LibreOffice stable release
cd /tmp
wget https://download.documentfoundation.org/libreoffice/stable/24.8.4/rpm/x86_64/LibreOffice_24.8.4_Linux_x86-64_rpm.tar.gz
tar -zxvf LibreOffice_24.8.4_Linux_x86-64_rpm.tar.gz

# 3. Install RPM packages
sudo dnf install -y /tmp/LibreOffice_*_Linux_x86-64_rpm/RPMS/*.rpm

# 4. Create symlink so 'soffice' is globally available on PATH
sudo ln -sf /opt/libreoffice24.8/program/soffice /usr/local/bin/soffice

# 5. Clean up temporary archives
rm -rf /tmp/LibreOffice*

# 6. Verify soffice binary
soffice --version
```

---

## 5. Directory Preparation & File Permissions

Create the standardized application directory hierarchy at `/opt/cloudpdf` and configure ownership and access permissions:

```bash
# 1. Create the application directory tree
sudo mkdir -p /opt/cloudpdf/backend
sudo mkdir -p /opt/cloudpdf/frontend/dist

# 2. Assign ownership to the application service user (ec2-user)
sudo chown -R ec2-user:ec2-user /opt/cloudpdf

# 3. Set directory traversal permissions so Nginx can access frontend/dist
# Directories require 755 (rwxr-xr-x); static files require 644 (rw-r--r--)
sudo chmod 755 /opt /opt/cloudpdf /opt/cloudpdf/frontend /opt/cloudpdf/frontend/dist

# 4. Transfer or clone project source code into /opt/cloudpdf
cd /opt/cloudpdf
# (If deploying via Git, tarball, or CI/CD runner):
# git clone <YOUR_REPOSITORY_URL> .
```

Verify directory layout:
```text
/opt/cloudpdf/
├── backend/
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   ├── requirements.txt
│   └── tests/
└── frontend/
    └── dist/
        ├── index.html
        └── assets/
```

---

## 6. Create Virtual Environment and Install Python Dependencies

```bash
cd /opt/cloudpdf/backend

# Create Python 3.12 virtual environment
python3.12 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade packaging tools
pip install --upgrade pip setuptools wheel

# Install all backend requirements
pip install -r requirements.txt
```

Verify critical installed packages:
```bash
python -c "import fastapi, sqlalchemy, psycopg2, boto3, pypdf, pymupdf, pdf2image, PIL, pdf2docx, alembic; print('All core modules imported successfully.')"
```

---

## 7. Database Credential Handling & Environment Configuration

CloudPDF Studio supports two methods for configuring production database credentials:
1. **Option A (Recommended Enterprise Pattern)**: AWS Systems Manager Parameter Store with KMS encryption.
2. **Option B**: Local environment file (`.env`) with strict file system permissions.

### Safe Password Handling Rules
- **URL Encoding for Special Characters**:
  If the RDS password contains special characters (`@`, `:`, `/`, `?`, `#`, `&`, `%`, `+`), they will break connection URI parsing if not URL-encoded.
  Use Python's `urllib.parse.quote_plus` to encode passwords safely:
  ```bash
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote_plus(sys.argv[1]))" 'your_raw_password'
  ```
  *Example*: `P@ss/word#1` becomes `P%40ss%2Fword%231`.
  *Alternatively*, pass discrete parameters (`DB_HOST`, `DB_USER`, `DB_PASSWORD`), which the backend automatically URL-encodes internally.
- **Never Print Passwords**:
  Do not use `echo $DATABASE_URL` in CI/CD pipelines, interactive scripts, or terminal output. Use `read -s` when inputting passwords interactively.

---

### Option A (Recommended): AWS SSM Parameter Store (`SecureString`)

Store the sensitive RDS connection string in AWS Systems Manager Parameter Store. The attached EC2 IAM role (`cloudpdf-ec2-ssm-role`) retrieves and decrypts it automatically on startup.

```bash
# Store the database URL securely in AWS SSM (run once via AWS CLI or AWS Console):
aws ssm put-parameter \
  --name "/pdfapp/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://cloudpdf_admin:ENCODED_PASSWORD@cloudpdf-postgres.cvckagyk6fse.ap-south-1.rds.amazonaws.com:5432/pdfapp?sslmode=require" \
  --region ap-south-1 \
  --overwrite
```

With SSM Parameter Store, `/opt/cloudpdf/backend/.env` requires **no database passwords on disk**:

```bash
cat << 'EOF' > /opt/cloudpdf/backend/.env
ENVIRONMENT=production
AWS_REGION=ap-south-1

# Enable dynamic parameter loading from AWS SSM Parameter Store
USE_SSM_CONFIG=true
SSM_PREFIX=/pdfapp

# S3 & Cognito Configuration (also loadable from SSM)
S3_BUCKET_NAME=cloudpdf-studio-storage-2026
COGNITO_USER_POOL_ID=ap-south-1_gwFz137XV
COGNITO_CLIENT_ID=3oij56tppqgoqnvs9dg352fe8t

# Same-Origin Reverse-Proxy: CORS origins empty for same-origin architecture
CORS_ORIGINS=[]
GUEST_RETENTION_HOURS=24
EOF

# Restrict permissions
chmod 600 /opt/cloudpdf/backend/.env
```

---

### Option B: Local Environment File (`.env`)

If not using SSM, provide the configuration directly in `/opt/cloudpdf/backend/.env`.

> [!IMPORTANT]
> The `.env` file must have permissions set to `chmod 600`. This ensures only the file owner (`ec2-user`) can read it, preventing unauthorized system processes or unprivileged users from accessing credentials.

```bash
cat << 'EOF' > /opt/cloudpdf/backend/.env
ENVIRONMENT=production
AWS_REGION=ap-south-1

# Amazon RDS Connection (Password must be URL-encoded; SSL mode required)
DATABASE_URL=postgresql://cloudpdf_admin:ENCODED_PASSWORD@cloudpdf-postgres.cvckagyk6fse.ap-south-1.rds.amazonaws.com:5432/pdfapp?sslmode=require

# S3 & Cognito Configuration
S3_BUCKET_NAME=cloudpdf-studio-storage-2026
COGNITO_USER_POOL_ID=ap-south-1_gwFz137XV
COGNITO_CLIENT_ID=3oij56tppqgoqnvs9dg352fe8t

# Same-Origin Architecture: CORS origins empty (see explanation below)
CORS_ORIGINS=[]
GUEST_RETENTION_HOURS=24
EOF

# Restrict file permissions
chmod 600 /opt/cloudpdf/backend/.env
```

---

### CORS Architecture in Production

In this deployment, Nginx serves both:
1. The frontend SPA on `http://<ec2-ip>/` (or `https://yourdomain.com/`)
2. The backend API on `http://<ec2-ip>/api/`

Because the frontend and backend share the **exact same origin** (identical protocol, domain, and port), the browser does **not** consider API calls cross-origin. Therefore, standard browser CORS preflight checks (`OPTIONS`) are not triggered, and `CORS_ORIGINS=[]` (empty list) is the cleanest, most secure configuration.

**When are CORS origins actually required?**
- **Decoupled Frontend Hosting**: If the frontend is hosted on AWS CloudFront (`https://d123.cloudfront.net`) or an S3 static bucket, while the backend runs on EC2 (`https://api.yourdomain.com`). In that case, add the frontend origin:
  `CORS_ORIGINS=["https://d123.cloudfront.net"]`
- **Local Decoupled Development**: If developers run Vite on `http://localhost:5173` without using the Vite reverse proxy:
  `CORS_ORIGINS=["http://localhost:5173"]`

---

## 8. Run Database Migrations via Alembic

Run Alembic schema migrations directly against Amazon RDS before starting the application service:

```bash
cd /opt/cloudpdf/backend
source venv/bin/activate
export PYTHONPATH=.

# 1. Verify current database migration state
alembic current

# 2. Apply all migrations up to head (Stage 1 tables + Stage 2 columns)
alembic upgrade head

# 3. Confirm that head revision is active
alembic current
```

Expected output:
```text
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade -> 0001_initial_stage1, initial stage1 schema
INFO  [alembic.runtime.migration] Running upgrade 0001_initial_stage1 -> 0002_add_stage2_cols, add stage2 pdfjob columns
0002_add_stage2_cols (head)
```

---

## 9. Configure Systemd Service for CloudPDF Backend

Create the systemd service file at `/etc/systemd/system/cloudpdf.service`:

```bash
sudo tee /etc/systemd/system/cloudpdf.service > /dev/null << 'EOF'
[Unit]
Description=CloudPDF Studio FastAPI Backend Service
After=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/cloudpdf/backend
EnvironmentFile=/opt/cloudpdf/backend/.env
ExecStart=/opt/cloudpdf/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --timeout-keep-alive 65
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudpdf
sudo systemctl start cloudpdf
```

---

## 10. Install and Configure Nginx (Reverse Proxy & Frontend Host)

Install Nginx:
```bash
sudo dnf install -y nginx
```

Create `/etc/nginx/conf.d/cloudpdf.conf` with full SPA routing, proxy buffering, 100 MB PDF upload limits, and compression:

```bash
sudo tee /etc/nginx/conf.d/cloudpdf.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Maximum file upload size for multi-page PDFs
    client_max_body_size 100M;

    # Gzip compression for frontend assets
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json;

    # Frontend Single Page Application (SPA)
    location / {
        root /opt/cloudpdf/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Static Asset Cache Optimization (Vite hashed bundles)
    location /assets/ {
        root /opt/cloudpdf/frontend/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Backend API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeouts for large PDF processing & OCR operations
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # Buffer settings for file uploads
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
EOF
```

Enable and start Nginx:
```bash
# Validate Nginx configuration syntax
sudo nginx -t

# Enable and start Nginx service
sudo systemctl enable nginx
sudo systemctl restart nginx
```

---

## 11. Deployment Verification & Health Checks

Run these comprehensive validation commands directly on the EC2 instance to verify all components:

### A. Verify Services Status
```bash
# Check FastAPI backend service
sudo systemctl status cloudpdf --no-pager

# Check Nginx web server service
sudo systemctl status nginx --no-pager
```

### B. Verify Nginx Configuration Syntax
```bash
sudo nginx -t
# Expected: "nginx: configuration file /etc/nginx/nginx.conf test is successful"
```

### C. Test Local FastAPI Health Endpoint (Direct on Port 8000)
```bash
curl -s http://127.0.0.1:8000/api/health | jq .
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

### D. Test Public Nginx Reverse Proxy Route (Port 80)
```bash
curl -s http://localhost/api/health | jq .
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

### E. Test Frontend Single Page Application Delivery
```bash
curl -I http://localhost/
```
Expected response:
```text
HTTP/1.1 200 OK
Server: nginx/...
Content-Type: text/html
...
```

### F. Verify Amazon S3 IAM Role Access
```bash
aws s3 ls s3://cloudpdf-studio-storage-2026/ --region ap-south-1
```
Expected output: Lists prefixes (`guest/`, `users/`, `forensic/`) or returns empty (exit code 0).

### G. Inspect Application Logs Safely (Without Leaking Passwords)
```bash
# View last 50 log entries from the systemd journal
sudo journalctl -u cloudpdf -n 50 --no-pager
```
*Note*: The application logger filters database connection strings and S3 credentials; logs will confirm startup, route accesses, and processing job IDs without exposing sensitive tokens.

---

## 12. Troubleshooting & Operational Runbook

| Symptom | Probable Cause | Remediation |
| :--- | :--- | :--- |
| `database_connected: false` in `/api/health` | RDS Security Group blocks port 5432 | In AWS Console > RDS > `cloudpdf-postgres`, edit inbound rules: Allow TCP 5432 from EC2 security group (`cloudpdf-server`). |
| `psycopg2.OperationalError: password authentication failed` | Special characters in password broke connection string | URL-encode password characters (`@` -> `%40`, `#` -> `%23`) or switch to SSM Parameter Store `SecureString`. |
| `403 Forbidden` on frontend `http://localhost/` | Nginx permissions on `/opt/cloudpdf` | Ensure directories are executable: `sudo chmod 755 /opt /opt/cloudpdf /opt/cloudpdf/frontend /opt/cloudpdf/frontend/dist`. |
| `413 Request Entity Too Large` on upload | Nginx `client_max_body_size` default exceeded | Ensure `client_max_body_size 100M;` is present in `/etc/nginx/conf.d/cloudpdf.conf` and reload Nginx (`sudo systemctl reload nginx`). |
| `soffice: command not found` during Word-to-PDF | LibreOffice RPMs not installed or symlink missing | Verify `/usr/local/bin/soffice` symlink points to `/opt/libreoffice24.8/program/soffice`. Run `soffice --version`. |
| S3 Upload fails with `AccessDenied` | IAM role missing S3 permissions | Ensure `CloudPDF-S3-Access` policy is attached to the EC2 instance profile `cloudpdf-ec2-ssm-role`. |
