import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import config

logger = logging.getLogger("cloudpdf.database")

# Resolve database connection URL (enforcing SSL in production and on RDS)
try:
    db_url = config.get_database_url()
except Exception as e:
    logger.warning(f"[Database] Could not resolve database URL: {e}. Defaulting to local sqlite.")
    db_url = "sqlite:///./dev.db"

engine_kwargs = {
    "pool_pre_ping": True,  # Verify connections before handing them out
}

if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Pool settings optimized for cloud / RDS connection resilience
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_recycle"] = 1800

try:
    engine = create_engine(db_url, **engine_kwargs)
    logger.info("[Database] Engine configured with target: %s", db_url.split("@")[-1] if "@" in db_url else "local")
except Exception as e:
    logger.error("[Database] Failed to initialize engine: %s", e)
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

