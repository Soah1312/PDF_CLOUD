import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    cognito_sub: str


class UserRead(UserBase):
    id: uuid.UUID
    cognito_sub: str
    storage_used_bytes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserSyncResponse(BaseModel):
    message: str
    user: UserRead
    is_new: bool

