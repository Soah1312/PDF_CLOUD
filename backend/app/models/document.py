import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    String,
    Text,
    Uuid,
    func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class PDFJob(Base):
    """
    PDF processing job record supporting both Guest (user_id=None, session_id present)
    and Authenticated members (user_id linked to users table).
    """
    __tablename__ = "pdf_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    is_pipeline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pipeline_steps: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_input_key: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_output_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    output_file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=0)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), default="application/pdf", nullable=True)
    output_mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Relationships
    user = relationship("User", back_populates="pdf_jobs")
    canary_tokens = relationship("CanaryToken", back_populates="job", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<PDFJob id={self.id} action={self.action_type} status={self.status}>"


class CanaryToken(Base):
    """
    Forensic invisible watermark canary token record for authenticated members.
    Maps forensic identifier to the member, output file job, and download event telemetry.
    """
    __tablename__ = "canary_tokens"

    token_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("pdf_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    recipient_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    recipient_email: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    tracking_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    original_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    watermarked_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    steganography_method: Mapped[str] = mapped_column(String(32), default="DUAL_LAYER", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False, index=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    download_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="canary_tokens")
    job = relationship("PDFJob", back_populates="canary_tokens")

    def __repr__(self) -> str:
        return f"<CanaryToken token_id={self.token_id} user_id={self.user_id} status={self.status}>"

