import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import config
from app.core.database import engine
from app.models.base import Base
import app.models  # Ensure all model classes are imported and registered on Base
from app.api import health
from app.api.v1.router import api_router as v1_router

logger = logging.getLogger("cloudpdf.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager:
    - In development, ensures tables exist.
    - In production, schema migrations are explicitly managed via Alembic (alembic upgrade head).
    - Gracefully log warning if PostgreSQL is starting up or temporarily unreachable.
    """
    logger.info(f"[Startup] Initializing CloudPDF Studio backend (Env: {config.ENVIRONMENT}, Region: {config.AWS_REGION})")
    if config.ENVIRONMENT != "production":
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("[Startup] Development database schema verified & tables ensured.")
        except Exception as e:
            logger.warning(
                f"[Startup] Database connection not ready during boot ({e}). "
                "Backend will still serve health and configuration endpoints until database is connected."
            )
    else:
        logger.info("[Startup] Production mode: schema migrations managed via Alembic (alembic upgrade head).")

    yield

    logger.info("[Shutdown] CloudPDF Studio backend shutting down.")


app = FastAPI(
    title="CloudPDF Studio API",
    description="Cloud-native PDF processing and automation platform with Dual-Access authentication (Guest & Amazon Cognito).",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routes
app.include_router(health.router, prefix="/api")
app.include_router(v1_router, prefix="/api/v1")


@app.get("/", summary="Root Index")
def root_index():
    return {
        "service": "CloudPDF Studio API",
        "version": "1.0.0",
        "environment": config.ENVIRONMENT,
        "docs_url": "/docs",
        "health_check": "/api/health",
        "auth_config": "/api/v1/auth/config",
    }

