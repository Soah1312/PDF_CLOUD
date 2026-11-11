import logging
import shutil
from typing import Dict, Any
from fastapi import APIRouter
from sqlalchemy import text
from app.core.config import config
from app.core.database import SessionLocal

logger = logging.getLogger("cloudpdf.health")
router = APIRouter(tags=["Health & Telemetry"])


@router.get("/health", summary="Health Check & Cloud Telemetry")
def get_health() -> Dict[str, Any]:
    """
    Returns system status, active environment, and connectivity indicators
    for PostgreSQL (RDS), AWS SSM Parameter Store, and Amazon Cognito.
    """
    database_connected = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            database_connected = True
    except Exception as e:
        logger.warning(f"[Health] Database connectivity check failed: {e}")
        database_connected = False

    cognito_configured = bool(config.COGNITO_USER_POOL_ID and config.COGNITO_CLIENT_ID)
    ssm_enabled = bool(config.USE_SSM_CONFIG)

    ocr_binaries = {
        "tesseract": bool(shutil.which("tesseract")),
        "ghostscript": bool(shutil.which("gs") or shutil.which("gswin64c")),
        "qpdf": bool(shutil.which("qpdf")),
    }

    return {
        "status": "healthy" if database_connected else "degraded",
        "environment": config.ENVIRONMENT,
        "database_connected": database_connected,
        "ssm_enabled": ssm_enabled,
        "cognito_configured": cognito_configured,
        "ocr_binaries": ocr_binaries,
        "region": config.AWS_REGION,
    }

