import os
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "local-security-test-secret-not-for-production-0123456789"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Todo, User
from app.security import create_access_token, hash_password, verify_password


class AccountSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = hash_password("test-password-123")

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            db.add_all([
                User(username="alice", hashed_password=self.password_hash),
                User(username="bob", hashed_password=self.password_hash),
            ])
            db.commit()

        def test_db():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app, raise_server_exceptions=False)
        self.alice = {"Authorization": f"Bearer {create_access_token('alice')}"}
        self.bob = {"Authorization": f"Bearer {create_access_token('bob')}"}

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def create_alice_todo(self):
        response = self.client.post(
            "/api/todos", json={"title": "Alice private task"}, headers=self.alice
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_other_account_cannot_list_private_todos(self):
        self.create_alice_todo()
        response = self.client.get("/api/todos", headers=self.bob)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.assertEqual(len(self.client.get("/api/todos", headers=self.alice).json()), 1)

    def test_other_account_cannot_patch_a_known_id(self):
        todo_id = self.create_alice_todo()
        response = self.client.patch(
            f"/api/todos/{todo_id}", json={"completed": True}, headers=self.bob
        )
        self.assertEqual(response.status_code, 404)
        task = self.client.get("/api/todos", headers=self.alice).json()[0]
        self.assertFalse(task["completed"])

    def test_other_account_cannot_delete_a_known_id(self):
        todo_id = self.create_alice_todo()
        response = self.client.delete(f"/api/todos/{todo_id}", headers=self.bob)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(self.client.get("/api/todos", headers=self.alice).json()), 1)

    def test_private_api_responses_cannot_be_cached(self):
        response = self.client.get("/api/todos", headers=self.alice)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("cache-control"), "no-store")
        login = self.client.post(
            "/api/auth/login", data={"username": "alice", "password": "test-password-123"}
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.headers.get("cache-control"), "no-store")

    def test_owner_can_update_and_delete_their_task(self):
        todo_id = self.create_alice_todo()
        response = self.client.patch(
            f"/api/todos/{todo_id}",
            json={"completed": True, "title": "Finished private task"},
            headers=self.alice,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["completed"])
        self.assertEqual(response.json()["title"], "Finished private task")
        self.assertEqual(
            self.client.delete(f"/api/todos/{todo_id}", headers=self.alice).status_code,
            204,
        )

    def test_create_cannot_forge_owner(self):
        response = self.client.post(
            "/api/todos", json={"title": "Injected task", "owner_id": 2}, headers=self.alice
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/todos", headers=self.bob).json(), [])

    def test_update_cannot_transfer_owner(self):
        todo_id = self.create_alice_todo()
        response = self.client.patch(
            f"/api/todos/{todo_id}", json={"owner_id": 2}, headers=self.alice
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/todos", headers=self.bob).json(), [])

    def test_legacy_unowned_todos_are_not_public(self):
        with Session(self.engine) as db:
            db.add(Todo(title="Legacy data must remain private"))
            db.commit()
        for headers in (self.alice, self.bob):
            with self.subTest(headers=headers):
                self.assertEqual(self.client.get("/api/todos", headers=headers).json(), [])

    def test_legacy_unowned_todos_cannot_be_changed(self):
        with Session(self.engine) as db:
            todo = Todo(title="Unassigned historical task")
            db.add(todo)
            db.commit()
            todo_id = todo.id
        self.assertEqual(
            self.client.patch(
                f"/api/todos/{todo_id}", json={"title": "Stolen"}, headers=self.alice
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f"/api/todos/{todo_id}", headers=self.alice).status_code,
            404,
        )

    def test_all_todo_operations_require_authentication(self):
        for method, path, payload in (
            ("GET", "/api/todos", None),
            ("POST", "/api/todos", {"title": "Anonymous"}),
            ("PATCH", "/api/todos/1", {"completed": True}),
            ("DELETE", "/api/todos/1", None),
        ):
            with self.subTest(method=method):
                response = self.client.request(method, path, json=payload)
                self.assertEqual(response.status_code, 401)

    def test_register_creates_hashed_account_that_can_log_in(self):
        response = self.client.post(
            "/api/auth/register",
            json={"username": "charlie", "password": "new-private-password"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(set(response.json()), {"id", "username", "created_at"})
        self.assertEqual(response.json()["username"], "charlie")
        with Session(self.engine) as db:
            user = db.scalar(select(User).where(User.username == "charlie"))
            self.assertIsNotNone(user)
            self.assertNotEqual(user.hashed_password, "new-private-password")
            self.assertTrue(verify_password("new-private-password", user.hashed_password))
        login = self.client.post(
            "/api/auth/login",
            data={"username": "charlie", "password": "new-private-password"},
        )
        self.assertEqual(login.status_code, 200)
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        self.assertEqual(self.client.get("/api/todos", headers=headers).json(), [])

    def test_register_rejects_duplicate_and_does_not_change_password(self):
        response = self.client.post(
            "/api/auth/register",
            json={"username": "alice", "password": "hijacked-password"},
        )
        self.assertEqual(response.status_code, 409)
        login = self.client.post(
            "/api/auth/login", data={"username": "alice", "password": "test-password-123"}
        )
        self.assertEqual(login.status_code, 200)

    def test_register_validates_username_and_password(self):
        for username, password in (
            ("", "long-enough-password"),
            ("ab", "long-enough-password"),
            ("a" * 51, "long-enough-password"),
            ("a b", "long-enough-password"),
            ("newuser", "short"),
            ("newuser", "x" * 129),
        ):
            with self.subTest(username=username, password_length=len(password)):
                response = self.client.post(
                    "/api/auth/register", json={"username": username, "password": password}
                )
                self.assertEqual(response.status_code, 422)

    def test_trimmed_registration_cannot_duplicate_username(self):
        response = self.client.post(
            "/api/auth/register",
            json={"username": " alice ", "password": "valid-private-password"},
        )
        self.assertEqual(response.status_code, 409)

    def test_new_account_does_not_receive_existing_users_todos(self):
        self.create_alice_todo()
        response = self.client.post(
            "/api/auth/register",
            json={"username": "newuser", "password": "new-private-password"},
        )
        self.assertEqual(response.status_code, 201)
        login = self.client.post(
            "/api/auth/login",
            data={"username": "newuser", "password": "new-private-password"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        self.assertEqual(self.client.get("/api/todos", headers=headers).json(), [])

    def test_blank_titles_and_null_updates_are_rejected(self):
        self.assertEqual(
            self.client.post("/api/todos", json={"title": "   "}, headers=self.alice).status_code,
            422,
        )
        todo_id = self.create_alice_todo()
        for payload in ({"title": None}, {"completed": None}):
            with self.subTest(payload=payload):
                self.assertEqual(
                    self.client.patch(
                        f"/api/todos/{todo_id}", json=payload, headers=self.alice
                    ).status_code,
                    422,
                )


if __name__ == "__main__":
    unittest.main()
