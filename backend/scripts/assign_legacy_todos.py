"""Assign todos that predate ownership tracking to an existing account.

Old records were created before the app stored which account made them, so
this script only runs with an explicit username and never guesses an owner.
"""

import argparse

from sqlalchemy import select, update

from app.database import SessionLocal
from app.models import Todo, User


def assign_legacy_todos(username: str) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            raise SystemExit(f"用户 {username} 不存在，请先确认用户名。")

        result = db.execute(
            update(Todo).where(Todo.owner_id.is_(None)).values(owner_id=user.id)
        )
        db.commit()
        return result.rowcount or 0


def main() -> None:
    parser = argparse.ArgumentParser(description="把无归属的历史待办分配给指定用户")
    parser.add_argument("username", help="接收历史待办的现有用户名")
    args = parser.parse_args()
    count = assign_legacy_todos(args.username)
    print(f"已将 {count} 条历史待办分配给 {args.username}")


if __name__ == "__main__":
    main()
