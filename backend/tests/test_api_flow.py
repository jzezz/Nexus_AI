import unittest
from collections.abc import Generator
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base


class NexusApiFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

        def override_get_db() -> Generator[Session, None, None]:
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def register(self, email: str = "api@example.com") -> dict[str, str]:
        response = self.client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "password123"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_registration_login_and_protected_routes(self) -> None:
        registered = self.register()
        self.assertEqual(registered["email"], "api@example.com")
        self.assertEqual(self.client.get("/api/v1/documents").status_code, 403)

        login = self.client.post(
            "/api/v1/auth/login",
            json={"email": "api@example.com", "password": "password123"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["user_id"], registered["user_id"])

        duplicate = self.client.post(
            "/api/v1/auth/register",
            json={"email": "api@example.com", "password": "password123"},
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_upload_retrieval_citations_history_and_deletion(self) -> None:
        token = self.register()["access_token"]
        headers = self.auth_headers(token)
        content = b"topic,details\nPilot launch,The pilot launch is scheduled for 15 October with the first ten customers.\n"

        upload = self.client.post(
            "/api/v1/upload",
            headers=headers,
            files={"file": ("launch-plan.csv", content, "text/csv")},
        )
        self.assertEqual(upload.status_code, 201, upload.text)
        document_id = upload.json()["document_id"]

        listed = self.client.get("/api/v1/documents", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()[0]["id"], document_id)
        self.assertTrue(listed.json()[0]["retrieval_ready"])

        detail = self.client.get(f"/api/v1/documents/{document_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertTrue(detail.json()["insights"]["suggested_questions"])

        chat = self.client.post(
            "/api/v1/chat",
            headers=headers,
            json={"question": "Which date is the pilot launch?", "document_ids": [document_id]},
        )
        self.assertEqual(chat.status_code, 200, chat.text)
        answer = chat.json()
        self.assertEqual(answer["route"], "retrieval")
        self.assertEqual(answer["scoped_document_ids"], [document_id])
        self.assertTrue(any("15 October" in citation["snippet"] for citation in answer["citations"]))

        history = self.client.get(
            "/api/v1/history", headers=headers, params={"conversation_id": answer["conversation_id"]}
        )
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual([message["role"] for message in history.json()], ["user", "assistant"])
        self.assertTrue(history.json()[-1]["citations"])

        conversations = self.client.get("/api/v1/conversations", headers=headers)
        self.assertEqual(conversations.status_code, 200, conversations.text)
        self.assertEqual(conversations.json()[0]["scoped_document_ids"], [document_id])

        deleted = self.client.delete(
            f"/api/v1/conversations/{answer['conversation_id']}", headers=headers
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(
            self.client.get(
                "/api/v1/history",
                headers=headers,
                params={"conversation_id": answer["conversation_id"]},
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(f"/api/v1/documents/{document_id}", headers=headers).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/documents/{document_id}", headers=headers).status_code, 404)

    def test_documents_and_conversations_are_isolated_by_user(self) -> None:
        first_user = self.register("first@example.com")
        first_headers = self.auth_headers(first_user["access_token"])
        upload = self.client.post(
            "/api/v1/upload",
            headers=first_headers,
            files={"file": ("notes.csv", b"topic,details\nLaunch,Launch is set for 15 October.", "text/csv")},
        )
        self.assertEqual(upload.status_code, 201, upload.text)
        document_id = upload.json()["document_id"]
        first_chat = self.client.post(
            "/api/v1/chat",
            headers=first_headers,
            json={"question": "When is launch date?", "document_ids": [document_id]},
        )
        self.assertEqual(first_chat.status_code, 200, first_chat.text)
        first_conversation_id = first_chat.json()["conversation_id"]

        second_headers = self.auth_headers(self.register("second@example.com")["access_token"])
        self.assertEqual(self.client.get("/api/v1/documents", headers=second_headers).json(), [])
        self.assertEqual(self.client.get(f"/api/v1/documents/{document_id}", headers=second_headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/documents/{document_id}", headers=second_headers).status_code, 404)
        self.assertEqual(
            self.client.get(
                "/api/v1/history",
                headers=second_headers,
                params={"conversation_id": first_conversation_id},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/conversations/{first_conversation_id}", headers=second_headers).status_code,
            404,
        )

    def test_health_readiness_and_invalid_uploads(self) -> None:
        self.assertEqual(self.client.get("/health").json()["status"], "ok")
        with patch("app.main.ping_database", return_value=True):
            self.assertEqual(self.client.get("/ready").json()["database"], "ok")
        with patch("app.main.ping_database", return_value=False):
            degraded = self.client.get("/ready")
        self.assertEqual(degraded.status_code, 503)
        self.assertEqual(degraded.json()["database"], "unavailable")
        headers = self.auth_headers(self.register()["access_token"])
        unsupported = self.client.post(
            "/api/v1/upload", headers=headers, files={"file": ("notes.txt", b"hello", "text/plain")}
        )
        self.assertEqual(unsupported.status_code, 400)

    def test_application_startup_and_health_route(self) -> None:
        with patch("app.main.init_db") as initialize_database:
            with TestClient(app) as client:
                response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        initialize_database.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
