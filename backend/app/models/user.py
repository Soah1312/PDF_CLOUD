import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class User(Base):
    """
    User model representing registered Amazon Cognito users.
    Synchronized upon authenticated login into PostgreSQL/RDS.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cognito_sub: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    pdf_jobs = relationship("PDFJob", back_populates="user", cascade="all, delete-orphan")
    canary_tokens = relationship("CanaryToken", back_populates="user", cascade="all, delete-orphan")
    workflows = relationship("SavedWorkflow", back_populates="user", cascade="all, delete-orphan")
    ocr_jobs = relationship("OCRJob", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"

