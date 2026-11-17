import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "local-security-test-secret-not-for-production-0123456789"

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.config import settings

BACKEND = Path(__file__).resolve().parents[1]


class OwnershipMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".test-db-", dir=BACKEND)
        self.addCleanup(self.temp.cleanup)
        self.url = f"sqlite:///{Path(self.temp.name, 'migration.db').as_posix()}"
        self.settings_patch = patch.object(settings, "database_url", self.url)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.config = Config(str(BACKEND / "alembic.ini"))
        command.upgrade(self.config, "309315edcaac")
        self.engine = create_engine(self.url)
        self.addCleanup(self.engine.dispose)
        with self.engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO users (id, username, hashed_password, created_at) "
                "VALUES (7, 'original-user', 'existing-hash', '2026-11-17 00:00:00')"
            ))
            connection.execute(text(
                "INSERT INTO todos (id, title, completed, created_at, updated_at) "
                "VALUES (42, 'Legacy task', false, '2026-11-17 00:00:00', '2026-11-17 00:00:00')"
            ))

    def test_upgrade_preserves_legacy_data_without_guessing_owner(self):
        command.upgrade(self.config, "head")
        self.engine.dispose()
        columns = {column["name"] for column in inspect(self.engine).get_columns("todos")}
        self.assertIn("owner_id", columns)
        with self.engine.connect() as connection:
            row = connection.execute(
                text("SELECT title, completed, owner_id FROM todos WHERE id = 42")
            ).one()
            self.assertEqual(row.title, "Legacy task")
            self.assertFalse(row.completed)
            self.assertIsNone(row.owner_id)
            self.assertEqual(
                connection.scalar(text("SELECT username FROM users WHERE id = 7")),
                "original-user",
            )

    def test_owner_foreign_key_rejects_nonexistent_accounts(self):
        command.upgrade(self.config, "head")
        self.engine.dispose()
        foreign_keys = inspect(self.engine).get_foreign_keys("todos")
        self.assertTrue(any(
            key["constrained_columns"] == ["owner_id"]
            and key["referred_table"] == "users"
            for key in foreign_keys
        ))
        with self.engine.connect() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
            connection.commit()
            with self.assertRaises(IntegrityError):
                connection.execute(text(
                    "INSERT INTO todos (title, owner_id, created_at, updated_at) "
                    "VALUES ('Invalid owner', 9999, '2026-11-17 00:00:00', '2026-11-17 00:00:00')"
                ))
            connection.rollback()
            connection.execute(text(
                "INSERT INTO todos (title, owner_id, created_at, updated_at) "
                "VALUES ('Owned task', 7, '2026-11-17 00:00:00', '2026-11-17 00:00:00')"
            ))
            connection.commit()
            self.assertEqual(
                connection.scalar(text("SELECT owner_id FROM todos WHERE title = 'Owned task'")),
                7,
            )


if __name__ == "__main__":
    unittest.main()
