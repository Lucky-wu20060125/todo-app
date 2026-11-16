import getpass

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def main() -> None:
    username = input("用户名: ").strip()
    password = getpass.getpass("密码（至少 8 位）: ")
    confirm = getpass.getpass("再次输入密码: ")

    if not username or not password:
        print("用户名和密码不能为空")
        return
    if len(password) < 8:
        print("密码至少 8 位")
        return
    if password != confirm:
        print("两次输入的密码不一致")
        return

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            print(f"用户 {username} 已存在")
            return

        db.add(User(username=username, hashed_password=hash_password(password)))
        db.commit()

    print(f"用户 {username} 创建成功")


if __name__ == "__main__":
    main()
