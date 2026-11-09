import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    String,
    Uuid,
    func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class SavedWorkflow(Base):
    """
    Automated workflow definition saved by authenticated members.
    Defines multi-step processing pipelines (e.g. OCR -> Watermark -> Compress).
    """
    __tablename__ = "saved_workflows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    steps: Mapped[Any] = mapped_column(JSON, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    # Relationships
    user = relationship("User", back_populates="workflows")

    def __repr__(self) -> str:
        return f"<SavedWorkflow id={self.id} name={self.name} user_id={self.user_id}>"

