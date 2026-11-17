from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

TodoTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
TodoColor = Literal["none", "red", "green", "yellow"]


class TodoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: TodoTitle


class TodoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: TodoTitle | None = None
    completed: bool | None = None
    color: TodoColor | None = None

    @field_validator("title", "completed", "color")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("字段不能为 null")
        return value


class TodoRead(BaseModel):
    id: int
    title: str
    completed: bool
    color: TodoColor
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TodoOrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[int] = Field(default_factory=list)


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=3, max_length=50, pattern=r"^\S+$"
        ),
    ]
    password: str = Field(min_length=8, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str


class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BootstrapRead(BaseModel):
    user: UserRead
    todos: list[TodoRead]


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    username: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=3, max_length=50, pattern=r"^\S+$"
        ),
    ]
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AccountUpdateRead(BaseModel):
    user: UserRead
    access_token: str
    token_type: str = "bearer"
