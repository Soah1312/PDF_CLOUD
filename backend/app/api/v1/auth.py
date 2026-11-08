import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends
from app.api.deps import get_current_user, get_optional_user
from app.core.config import config
from app.models.user import User
from app.schemas.user import UserRead, UserSyncResponse

logger = logging.getLogger("cloudpdf.api.auth")
router = APIRouter(prefix="/auth", tags=["Authentication & Profile"])


@router.get("/config", summary="Public Cognito Auth Configuration")
def get_auth_config() -> Dict[str, Any]:
    """
    Exposes public Amazon Cognito parameters (User Pool ID, App Client ID, Region)
    for frontend SPA client initialization without secret disclosure.
    """
    return {
        "userPoolId": config.COGNITO_USER_POOL_ID,
        "clientId": config.COGNITO_CLIENT_ID,
        "region": config.AWS_REGION,
        "isConfigured": bool(config.COGNITO_USER_POOL_ID and config.COGNITO_CLIENT_ID),
    }


@router.get("/me", response_model=UserRead, summary="Get Current Authenticated User")
def get_me(current_user: User = Depends(get_current_user)) -> User:
    """
    Returns the RDS user profile of the currently authenticated Cognito member.
    """
    return current_user


@router.post("/sync", response_model=UserSyncResponse, summary="Sync Cognito User to Database")
def sync_user(current_user: User = Depends(get_current_user)) -> UserSyncResponse:
    """
    Explicit synchronization hook triggered when a member logs in or refreshes their session.
    Verifies user existence in PostgreSQL/RDS and returns their database state.
    """
    return UserSyncResponse(
        message="User profile synchronized successfully with cloud database.",
        user=UserRead.model_validate(current_user),
        is_new=False
    )


@router.get("/session-context", summary="Inspect Current Caller Access Tier (Guest vs Auth)")
def get_session_context(user: Optional[User] = Depends(get_optional_user)) -> Dict[str, Any]:
    """
    Demonstrates the Dual-Access Model:
    - Guests receive an unauthenticated tier context with temporary session allowances.
    - Members receive an authenticated tier context with persistent vault and canary capabilities.
    """
    if user:
        return {
            "tier": "AUTHENTICATED_MEMBER",
            "authenticated": True,
            "user_id": str(user.id),
            "email": user.email,
            "storage_used_bytes": user.storage_used_bytes,
            "features": [
                "persistent_document_vault",
                "forensic_canary_watermarking",
                "saved_automated_workflows",
                "batch_processing_pipeline"
            ]
        }
    else:
        return {
            "tier": "GUEST_VISITOR",
            "authenticated": False,
            "user_id": None,
            "features": [
                "ephemeral_basic_actions",
                "temporary_session_storage",
                "single_file_processing"
            ]
        }

