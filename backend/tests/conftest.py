import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.base import get_session, init_db, make_engine
from app.main import app
from app.services.ingestion import sync_folder

REAL_INPUTS = Path(__file__).resolve().parents[2] / "Inputs"


@pytest.fixture
def session(tmp_path) -> Iterator[Session]:
    """A session on a fresh database file, created the same way the app creates it."""
    engine = make_engine(tmp_path / "test.db")
    init_db(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def inputs(tmp_path: Path) -> Path:
    """A private copy of the supplied data, so tests never modify the originals."""
    return Path(shutil.copytree(REAL_INPUTS, tmp_path / "Inputs"))


@pytest.fixture
def client(session: Session, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client on the fresh, empty test database."""

    def override_session():
        with Session(session.get_bind()) as request_session:
            yield request_session

    monkeypatch.setitem(app.dependency_overrides, get_session, override_session)
    return TestClient(app)


@pytest.fixture
def loaded(client: TestClient, session: Session, inputs: Path) -> TestClient:
    """The client after the supplied data has been imported."""
    sync_folder(session, inputs)
    return client
