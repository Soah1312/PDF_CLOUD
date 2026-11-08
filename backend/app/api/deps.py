import logging
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import verify_cognito_token
from app.models.user import User

logger = logging.getLogger("cloudpdf.deps")

# HTTPBearer security scheme (auto_error=False allows optional auth for guest routes)
security_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a database session per request,
    closing it upon completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> User:
    """
    Enforces authentication. Validates Amazon Cognito JWT bearer token,
    synchronizes/retrieves the User record in PostgreSQL/RDS, and returns the User.
    Raises HTTP 401 if token is missing or invalid.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = verify_cognito_token(credentials.credentials)

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not contain a subject ('sub') identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In Cognito ID tokens, 'email' is typically a top-level claim.
    # Fall back to username or sub if missing.
    email = (
        claims.get("email")
        or claims.get("cognito:username")
        or f"{sub}@cloudpdf.member"
    )

    # Lookup or create user in RDS database
    user = db.query(User).filter(User.cognito_sub == sub).first()
    if not user:
        logger.info(f"[Auth] Registering new Cognito member in PostgreSQL: {email} (sub={sub})")
        user = User(
            cognito_sub=sub,
            email=email,
            storage_used_bytes=0,
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception as e:
            db.rollback()
            # If concurrent request already inserted the user
            user = db.query(User).filter(User.cognito_sub == sub).first()
            if not user:
                logger.error(f"[Auth] Failed to persist user to database: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database error while synchronizing authenticated user profile."
                )

    return user


def get_optional_user(
    db: Session = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Optional[User]:
    """
    Dual-Access dependency.
    If a valid Bearer token is provided, returns the authenticated User.
    If no token is provided or the token is invalid, returns None (Guest mode).
    Routes can inspect whether user is None to adjust quotas and permissions.
    """
    if not credentials or not credentials.credentials:
        return None

    try:
        claims = verify_cognito_token(credentials.credentials)
        sub = claims.get("sub")
        if not sub:
            return None

        email = (
            claims.get("email")
            or claims.get("cognito:username")
            or f"{sub}@cloudpdf.member"
        )

        user = db.query(User).filter(User.cognito_sub == sub).first()
        if not user:
            logger.info(f"[Auth] Registering new guest-turned-member: {email} (sub={sub})")
            user = User(cognito_sub=sub, email=email, storage_used_bytes=0)
            db.add(user)
            db.commit()
            db.refresh(user)

        return user
    except Exception as e:
        logger.debug(f"[Auth] Optional user token verification failed or expired: {e}. Treating as Guest.")
        return None

