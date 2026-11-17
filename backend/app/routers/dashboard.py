from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Todo, User
from ..schemas import BootstrapRead, TodoRead, UserRead
from ..security import get_current_user

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/bootstrap", response_model=BootstrapRead)
def bootstrap(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    todos = db.scalars(
        select(Todo)
        .where(Todo.owner_id == current_user.id)
        .order_by(Todo.position.asc(), Todo.id.desc())
    ).all()
    return BootstrapRead(
        user=UserRead.model_validate(current_user),
        todos=[TodoRead.model_validate(todo) for todo in todos],
    )
