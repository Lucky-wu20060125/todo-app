from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TodoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class TodoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    completed: bool | None = None


class TodoRead(BaseModel):
    id: int
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
