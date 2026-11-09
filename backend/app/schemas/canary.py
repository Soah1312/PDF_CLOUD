import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class CanaryEmbedRequest(BaseModel):
    recipient_name: Optional[str] = Field(None, max_length=128)
    recipient_email: Optional[str] = Field(None, max_length=128)
    organization: Optional[str] = Field(None, max_length=128)
    tracking_note: Optional[str] = Field(None, max_length=255)


class CanaryTokenRead(BaseModel):
    token_id: str
    user_id: uuid.UUID
    job_id: uuid.UUID
    recipient_name: Optional[str] = None
    recipient_email: Optional[str] = None
    organization: Optional[str] = None
    tracking_note: Optional[str] = None
    original_sha256: Optional[str] = None
    watermarked_sha256: Optional[str] = None
    steganography_method: str = "DUAL_LAYER"
    status: str = "ACTIVE"
    created_at: datetime
    revoked_at: Optional[datetime] = None
    download_ip: Optional[str] = None
    download_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CanaryVerificationResponse(BaseModel):
    status: str  # "VERIFIED", "NOT_FOUND", "INVALID_OR_CORRUPTED", "REVOKED", "INCONCLUSIVE"
    message: str
    token_id: Optional[str] = None
    token_masked: Optional[str] = None
    is_owner: bool = False
    created_at: Optional[datetime] = None
    organization: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_email: Optional[str] = None
    tracking_note: Optional[str] = None
    creator_email: Optional[str] = None
    original_sha256: Optional[str] = None
    file_sha256: Optional[str] = None
    markers_detected: List[str] = Field(default_factory=list)


class CanaryRevokeResponse(BaseModel):
    token_id: str
    status: str
    revoked_at: datetime
    message: str

