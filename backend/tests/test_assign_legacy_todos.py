import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

SETUP_CODE = """
from sqlalchemy import text
from app.database import Base, engine
from app import models  # noqa: F401
from app.security import hash_password

Base.metadata.create_all(engine)

with engine.begin() as connection:
    connection.execute(text(
        "INSERT INTO users (id, username, hashed_password, created_at) "
        "VALUES (1, 'owner', :hash, '2026-11-17 00:00:00')"
    ), {'hash': hash_password('owner-password')})
    connection.execute(text(
        "INSERT INTO users (id, username, hashed_password, created_at) "
        "VALUES (2, 'other', :hash, '2026-11-17 00:00:00')"
    ), {'hash': hash_password('other-password')})
    connection.execute(text(
        "INSERT INTO todos (id, title, completed, created_at, updated_at, owner_id) "
        "VALUES (11, 'Legacy one', false, '2026-11-17 00:00:00', '2026-11-17 00:00:00', NULL)"
    ))
    connection.execute(text(
        "INSERT INTO todos (id, title, completed, created_at, updated_at, owner_id) "
        "VALUES (12, 'Already owned', false, '2026-11-17 00:00:00', '2026-11-17 00:00:00', 2)"
    ))
"""

VERIFY_CODE = """
import json
from sqlalchemy import text
from app.database import engine

with engine.connect() as connection:
    rows = connection.execute(text(
        "SELECT id, title, owner_id FROM todos ORDER BY id"
    )).all()
    print(json.dumps([[row.id, row.title, row.owner_id] for row in rows]))
"""


class AssignLegacyTodosTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".test-db-", dir=BACKEND)
        self.addCleanup(self.temp.cleanup)
        self.db_path = Path(self.temp.name, "assign.db")
        self.env = {
            **os.environ,
            "DATABASE_URL": f"sqlite:///{self.db_path.as_posix()}",
            "SECRET_KEY": "local-legacy-test-secret-0123456789",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONIOENCODING": "utf-8",
        }
        self.run_python(SETUP_CODE)

    def run_python(self, code, *args):
        return subprocess.run(
            [sys.executable, "-c", code, *args],
            cwd=BACKEND,
            env=self.env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=True,
        )

    def run_script(self, username):
        return subprocess.run(
            [sys.executable, "-m", "scripts.assign_legacy_todos", username],
            cwd=BACKEND,
            env=self.env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )

    def test_assigns_only_unowned_todos_to_named_user(self):
        result = self.run_script("owner")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("已将 1 条历史待办分配给 owner", result.stdout)
        rows = json.loads(self.run_python(VERIFY_CODE).stdout.strip())
        self.assertEqual(rows, [[11, "Legacy one", 1], [12, "Already owned", 2]])

    def test_unknown_username_fails_without_changing_data(self):
        result = self.run_script("missing-user")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("不存在", result.stderr)
        rows = json.loads(self.run_python(VERIFY_CODE).stdout.strip())
        self.assertEqual(rows, [[11, "Legacy one", None], [12, "Already owned", 2]])


if __name__ == "__main__":
    unittest.main()
