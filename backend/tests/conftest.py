"""Shared pytest fixtures for the backend test suite.

Every test gets a fresh, fully isolated in-memory SQLite database and a
fresh local-file storage root, even though `app.main` (and every router
module it pulls in) is only ever imported once for the whole pytest
session. This works because `app.db.get_db()` and
`app.services.storage.get_storage()` both resolve their session
factory / settings from their *module's current global* at call time
(not at import time), so reassigning `app.db.engine`/`SessionLocal` and
`app.services.storage.settings.storage_root` before each test takes
effect on every request that test makes.

Required settings (JWT_SECRET, STORAGE_SIGNING_SECRET, ...) are given
safe test defaults here, before anything under `app` is imported, so
`Settings()` never has to fall back to its `mysql://`-pointing
production default for `database_url` — not that it matters, since
every test replaces the engine directly regardless of what
`DATABASE_URL` resolved to at import time.
"""
import os
import shutil
import sys
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("STORAGE_SIGNING_SECRET", "test-signing-secret")
os.environ.setdefault("STORAGE_ROOT", tempfile.mkdtemp(prefix="utender-test-storage-"))
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("S3_REGION", "us-east-1")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as db_module
import app.models  # noqa: F401  registers every ORM model on Base.metadata
import app.services.storage as storage_module

from fastapi.testclient import TestClient
from app.main import app as fastapi_app  # imported once for the whole session


@pytest.fixture(autouse=True)
def isolated_backend(tmp_path):
    """Runs before/after every test: fresh DB, fresh storage root."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db_module.engine = engine
    db_module.SessionLocal = SessionLocal
    db_module.Base.metadata.create_all(bind=engine)

    storage_root = tmp_path / "storage"
    storage_root.mkdir()
    storage_module.settings.storage_root = str(storage_root)
    storage_module.settings.storage_backend = "local"
    storage_module._storage_instance = None

    yield

    engine.dispose()


@pytest.fixture
def client():
    """A single anonymous TestClient. Most tests create their own
    per-actor clients directly (`TestClient(app)`) since each actor
    needs its own cookie jar — this fixture covers the simple cases."""
    return TestClient(fastapi_app)


@pytest.fixture
def db():
    """A raw DB session for setup/assertions that bypass the API
    (e.g. flipping a document straight to approved, or reading an
    AuditLog row the API doesn't expose)."""
    session = db_module.SessionLocal()
    try:
        yield session
    finally:
        session.close()
