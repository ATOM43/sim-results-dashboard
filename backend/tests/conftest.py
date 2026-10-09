from collections.abc import Iterator

import pytest
from sqlalchemy.orm import Session

from app.db.base import init_db, make_engine


@pytest.fixture
def session(tmp_path) -> Iterator[Session]:
    """A session on a fresh database file, created the same way the app creates it."""
    engine = make_engine(tmp_path / "test.db")
    init_db(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()
