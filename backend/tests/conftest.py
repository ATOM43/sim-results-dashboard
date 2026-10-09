import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.db.base import init_db, make_engine

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
