import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class OCRJob(Base):
    """
    OCRmyPDF + Tesseract OCR processing job record.
    Supports both Guest sessions and Authenticated members.
    Tracks processing stages, progress, and searchable PDF reconstruction status.
    """
    __tablename__ = "ocr_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    guest_session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_s3_key: Mapped[str] = mapped_column(String(512), nullable=False)
    output_s3_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ocr_engine: Mapped[str] = mapped_column(String(64), default="ocrmypdf", nullable=False)
    language: Mapped[str] = mapped_column(String(32), default="eng", nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    output_file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False, index=True)  # PENDING, PROCESSING, COMPLETED, FAILED
    processing_stage: Mapped[str] = mapped_column(String(64), default="QUEUED", nullable=False)  # QUEUED, VALIDATING, STORING_ORIGINAL, OCR_PROCESSING, VERIFYING_OUTPUT, STORING_OUTPUT, COMPLETED, FAILED
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0 to 100
    has_digital_text: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    force_ocr: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    detected_words: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Relationships
    user = relationship("User", back_populates="ocr_jobs")

    def __repr__(self) -> str:
        return f"<OCRJob id={self.id} status={self.status} stage={self.processing_stage} progress={self.progress}%>"
