import uuid
from datetime import datetime
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, ConfigDict


class SavedWorkflowBase(BaseModel):
    name: str
    description: Optional[str] = None
    steps: List[Dict[str, Any]]
    is_favorite: bool = False


class SavedWorkflowCreate(SavedWorkflowBase):
    pass


class SavedWorkflowRead(SavedWorkflowBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

