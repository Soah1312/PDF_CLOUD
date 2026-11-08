import time
import logging
from typing import Dict, Any, Optional
import requests
from fastapi import HTTPException, status
from jose import jwt, JWTError, ExpiredSignatureError
from app.core.config import config

logger = logging.getLogger("cloudpdf.security")

# In-memory cache for Cognito JWKS public keys
_JWKS_CACHE: Dict[str, Any] = {
    "keys": {},
    "last_fetched": 0,
    "user_pool_id": ""
}
CACHE_TTL_SECONDS = 3600  # 1 hour


def get_cognito_jwks() -> Dict[str, Any]:
    """
    Fetches and caches the JSON Web Key Set (JWKS) from Amazon Cognito.
    """
    current_time = time.time()
    user_pool_id = config.COGNITO_USER_POOL_ID
    region = config.AWS_REGION

    if not user_pool_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Amazon Cognito User Pool ID is not configured in backend settings (.env or SSM)."
        )

    # Return cached keys if valid and matching current pool ID
    if (
        _JWKS_CACHE["keys"]
        and _JWKS_CACHE["user_pool_id"] == user_pool_id
        and (current_time - _JWKS_CACHE["last_fetched"]) < CACHE_TTL_SECONDS
    ):
        return _JWKS_CACHE["keys"]

    jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    logger.info(f"[Security] Fetching Cognito JWKS public keys from: {jwks_url}")

    try:
        response = requests.get(jwks_url, timeout=5)
        response.raise_for_status()
        jwks_data = response.json()

        # Map keys by 'kid' for O(1) lookup
        keys_by_kid = {key["kid"]: key for key in jwks_data.get("keys", [])}
        _JWKS_CACHE["keys"] = keys_by_kid
        _JWKS_CACHE["last_fetched"] = current_time
        _JWKS_CACHE["user_pool_id"] = user_pool_id
        logger.info(f"[Security] Successfully cached {len(keys_by_kid)} Cognito public keys.")
        return keys_by_kid
    except requests.RequestException as e:
        logger.error(f"[Security] Failed to fetch Cognito JWKS keys: {e}")
        # If cache exists even if expired, return it as fallback
        if _JWKS_CACHE["keys"]:
            return _JWKS_CACHE["keys"]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to contact Amazon Cognito to verify authentication credentials."
        )


def verify_cognito_token(token: str) -> Dict[str, Any]:
    """
    Validates a JWT token issued by Amazon Cognito User Pools.
    Verifies signature, expiration, issuer, and client audience.
    Supports both ID tokens and Access tokens.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_pool_id = config.COGNITO_USER_POOL_ID
    client_id = config.COGNITO_CLIENT_ID
    region = config.AWS_REGION
    expected_issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"

    if not user_pool_id or not client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cognito configuration missing. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID."
        )

    # 1. Extract unverified header to locate key ID (kid)
    try:
        headers = jwt.get_unverified_header(token)
    except JWTError as e:
        logger.warning(f"[Security] Invalid token header: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    kid = headers.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token header missing 'kid' claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Match kid against JWKS
    keys = get_cognito_jwks()
    public_key = keys.get(kid)
    if not public_key:
        # Refresh cache once in case key was rotated
        _JWKS_CACHE["last_fetched"] = 0
        keys = get_cognito_jwks()
        public_key = keys.get(kid)
        if not public_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token signed with unrecognized public key.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 3. Decode and verify signature, issuer, and expiry
    try:
        # Decode without audience first to determine token_use (id vs access)
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=expected_issuer,
            options={
                "verify_aud": False,  # We verify audience dynamically below
                "verify_exp": True,
                "verify_iss": True,
            }
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as e:
        logger.warning(f"[Security] JWT signature or issuer verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 4. Verify audience/client_id according to token_use
    token_use = claims.get("token_use")
    if token_use == "id":
        if claims.get("aud") != client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience (aud) does not match the configured Cognito Client ID.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    elif token_use == "access":
        if claims.get("client_id") != client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token client_id does not match the configured Cognito Client ID.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing valid 'token_use' claim ('id' or 'access').",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims

