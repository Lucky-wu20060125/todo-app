import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

if os.getenv("VERCEL"):
    # Serverless functions are short-lived; Neon's pooler manages connection reuse.
    engine = create_engine(
        settings.database_url,
        poolclass=NullPool,
        pool_pre_ping=False,
    )
else:
    engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
