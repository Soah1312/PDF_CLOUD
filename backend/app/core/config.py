import logging
import urllib.parse
from functools import lru_cache
from typing import List, Union, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("cloudpdf.config")
logging.basicConfig(level=logging.INFO)


class Settings(BaseSettings):
    """
    Application settings supporting dual-source loading:
    1. Local .env file (for rapid offline/local development)
    2. AWS Systems Manager (SSM) Parameter Store (for production cloud deployments)
    """
    ENVIRONMENT: str = "development"
    AWS_REGION: str = "ap-south-1"
    USE_SSM_CONFIG: bool = False
    SSM_PREFIX: str = "/pdfapp"

    # Database configuration
    DATABASE_URL: Optional[str] = None
    DB_HOST: Optional[str] = None
    DB_PORT: int = 5432
    DB_USER: Optional[str] = None
    DB_PASSWORD: Optional[str] = None
    DB_NAME: str = "pdfapp"
    DB_SSLMODE: Optional[str] = None

    # Amazon S3
    S3_BUCKET_NAME: str = "cloudpdf-studio-storage-2026"

    # Amazon Cognito
    COGNITO_USER_POOL_ID: str = "ap-south-1_gwFz137XV"
    COGNITO_CLIENT_ID: str = "3oij56tppqgoqnvs9dg352fe8t"

    # Guest Retention Policy
    GUEST_RETENTION_HOURS: int = 24

    # CORS configuration
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173", "http://localhost:3000"]

    # Security / JWT
    JWT_ALGORITHM: str = "RS256"

    # Forensic Canary Cryptographic Secret (persistent across restarts, must be 32+ chars in prod)
    CANARY_HMAC_SECRET: Optional[str] = None

    # OCRmyPDF + Tesseract OCR Settings
    OCR_DEFAULT_LANGUAGE: str = "eng"
    OCR_TIMEOUT_SECONDS: int = 600
    OCR_ROTATE_PAGES: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    def get_database_url(self) -> str:
        """
        Resolves the database connection string.
        1. Uses DATABASE_URL if explicitly set.
        2. Assembles from discrete DB_HOST, DB_USER, DB_PASSWORD if provided.
        3. In production, strictly forbids localhost and raises an explicit error if unconfigured.
        4. In development, provides a safe local fallback.
        5. Automatically requires and enforces ?sslmode=require for AWS RDS connections.
        """
        raw_url = self.DATABASE_URL

        # Assemble from discrete parameters if DATABASE_URL not set but DB_HOST is present
        if not raw_url and self.DB_HOST and self.DB_USER:
            pwd = f":{urllib.parse.quote_plus(self.DB_PASSWORD)}" if self.DB_PASSWORD else ""
            raw_url = f"postgresql://{self.DB_USER}{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

        # Development fallback
        if not raw_url:
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    "Production database configuration missing. Please configure DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD."
                )
            raw_url = "postgresql://postgres:postgres@localhost:5432/pdfapp"

        # Normalize postgres:// to postgresql://
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql://", 1)

        # Disallow localhost in production
        if self.ENVIRONMENT == "production" and ("localhost" in raw_url or "127.0.0.1" in raw_url):
            raise ValueError(
                "Production environment cannot use localhost/127.0.0.1 as database target. Configure the AWS RDS endpoint."
            )

        # Enforce sslmode=require for AWS RDS or production
        if raw_url.startswith("postgresql://"):
            if "rds.amazonaws.com" in raw_url or self.ENVIRONMENT == "production" or self.DB_SSLMODE == "require":
                if "sslmode=" not in raw_url:
                    separator = "&" if "?" in raw_url else "?"
                    raw_url = f"{raw_url}{separator}sslmode=require"

        return raw_url

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                # Handle JSON array representation
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:5173", "http://localhost:3000"]


def load_ssm_parameters(settings: Settings) -> Settings:
    """
    Dynamically loads parameters from AWS SSM Parameter Store if USE_SSM_CONFIG is enabled.
    Falls back gracefully to existing environment/.env variables if credentials are missing
    or if SSM is unreachable, ensuring local developer workflows are never blocked.
    """
    if not settings.USE_SSM_CONFIG:
        logger.info("[Config] USE_SSM_CONFIG is False. Loading configuration from environment / .env file.")
        return settings

    logger.info(f"[Config] Fetching parameters dynamically from AWS SSM (prefix: {settings.SSM_PREFIX}, region: {settings.AWS_REGION})...")
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError

        ssm_client = boto3.client("ssm", region_name=settings.AWS_REGION)
        paginator = ssm_client.get_paginator("get_parameters_by_path")
        page_iterator = paginator.paginate(
            Path=settings.SSM_PREFIX,
            Recursive=True,
            WithDecryption=True
        )

        loaded_keys = []
        for page in page_iterator:
            for param in page.get("Parameters", []):
                param_name = param["Name"]
                # Extract the relative key name: e.g. /pdfapp/DATABASE_URL -> DATABASE_URL
                key = param_name[len(settings.SSM_PREFIX):].lstrip("/").upper()
                value = param["Value"]

                if hasattr(settings, key):
                    # Handle boolean conversion
                    if isinstance(getattr(settings, key), bool):
                        setattr(settings, key, value.lower() in ("true", "1", "t"))
                    elif isinstance(getattr(settings, key), int):
                        try:
                            setattr(settings, key, int(value))
                        except ValueError:
                            pass
                    else:
                        setattr(settings, key, value)
                    loaded_keys.append(key)

        logger.info(f"[Config] Successfully loaded {len(loaded_keys)} parameters from AWS SSM: {loaded_keys}")
    except (BotoCoreError, ClientError) as e:
        logger.warning(
            f"[Config] AWS SSM parameter retrieval failed ({e.__class__.__name__}: {e}). "
            "Gracefully falling back to local .env configuration so development is not blocked."
        )
    except Exception as e:
        logger.warning(
            f"[Config] Unexpected error querying AWS SSM: {e}. Falling back to local .env configuration."
        )

    return settings


@lru_cache()
def get_settings() -> Settings:
    """
    Singleton getter for application settings.
    Validates security constraints across environments.
    """
    initial_settings = Settings()
    loaded_settings = load_ssm_parameters(initial_settings)

    # Validate critical production settings
    is_prod = str(loaded_settings.ENVIRONMENT).lower() in ("production", "prod")
    if is_prod:
        secret = loaded_settings.CANARY_HMAC_SECRET
        if not secret or len(secret.strip()) < 32:
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: CANARY_HMAC_SECRET is missing or insecure. "
                "In production, a cryptographically random secret of at least 32 characters must be configured "
                "in backend/.env or environment variables."
            )
        insecure_placeholders = {
            "insecure", "changeme", "secret", "password",
            "cloudpdf_forensic_canary_hmac_secret_2026_ap_south_1"
        }
        if secret.strip().lower() in insecure_placeholders:
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: CANARY_HMAC_SECRET cannot use an insecure or placeholder default."
            )
    else:
        # Development / Testing fallback
        if not loaded_settings.CANARY_HMAC_SECRET:
            logger.warning(
                "[Config] CANARY_HMAC_SECRET is not set. Using local development fallback secret. "
                "Production startup will fail safely if an explicit 32+ char secret is not provided."
            )
            loaded_settings.CANARY_HMAC_SECRET = "dev_local_canary_hmac_secret_for_testing_only_32chars"

    return loaded_settings


# Exported singleton instance
config = get_settings()

