from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Todo, User
from ..schemas import TodoCreate, TodoOrderUpdate, TodoRead, TodoUpdate
from ..security import get_current_user

router = APIRouter(prefix="/api/todos", tags=["todos"])


@router.get("", response_model=list[TodoRead])
def list_todos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Todo)
        .where(Todo.owner_id == current_user.id)
        .order_by(Todo.position.asc(), Todo.id.desc())
    ).all()


@router.post("", response_model=TodoRead, status_code=status.HTTP_201_CREATED)
def create_todo(
    payload: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    min_position = db.scalar(
        select(func.min(Todo.position)).where(Todo.owner_id == current_user.id)
    )
    todo = Todo(
        title=payload.title,
        owner_id=current_user.id,
        position=(min_position - 1 if min_position is not None else 0),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/order", response_model=list[TodoRead])
def reorder_todos(
    payload: TodoOrderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    todos = db.scalars(select(Todo).where(Todo.owner_id == current_user.id)).all()
    by_id = {todo.id: todo for todo in todos}
    if (
        len(payload.ids) != len(by_id)
        or len(set(payload.ids)) != len(payload.ids)
        or set(payload.ids) != set(by_id)
    ):
        raise HTTPException(status_code=400, detail="任务列表已变化，请刷新后重试")

    for position, todo_id in enumerate(payload.ids):
        by_id[todo_id].position = position

    db.commit()
    return [by_id[todo_id] for todo_id in payload.ids]


@router.patch("/{todo_id}", response_model=TodoRead)
def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    todo = db.scalar(
        select(Todo).where(Todo.id == todo_id, Todo.owner_id == current_user.id)
    )
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    todo = db.scalar(
        select(Todo).where(Todo.id == todo_id, Todo.owner_id == current_user.id)
    )
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(todo)
    db.commit()
    return None
