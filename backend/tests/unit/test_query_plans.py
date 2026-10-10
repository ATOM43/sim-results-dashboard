"""The hot read paths must look rows up through an index, never scan a table."""

from pathlib import Path

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.db.models import Result, SourceFile
from app.services import demands as service
from app.services.ingestion import sync_folder
from app.services.queries import demands, results


def plans(session: Session, read) -> list[str]:
    """Run `read`, then EXPLAIN QUERY PLAN every statement it sent, exactly as it was sent."""
    statements: list[tuple[str, tuple]] = []

    def capture(_conn, _cursor, statement, parameters, _context, _executemany):
        statements.append((statement, parameters))

    engine = session.get_bind()
    session.expire_all()  # so nothing is answered from the identity map
    event.listen(engine, "before_cursor_execute", capture)
    try:
        assert read() is not None
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    connection = session.connection()
    return [
        row[3]
        for statement, parameters in statements
        for row in connection.exec_driver_sql(f"EXPLAIN QUERY PLAN {statement}", parameters)
    ]


@pytest.fixture
def lens_rev2(session: Session, inputs: Path) -> Result:
    sync_folder(session, inputs)
    return session.scalars(
        select(Result).join(Result.source_file).where(SourceFile.source_key == "rev2/Lens.csv")
    ).one()


def test_chart_samples_are_found_by_primary_key(session: Session, lens_rev2: Result):
    result_id = lens_rev2.id

    steps = plans(session, lambda: results.get_result(session, result_id))

    # `samples` is WITHOUT ROWID, so its primary key (result_id, frequency_hz) is the index:
    # it finds one result's curve and already returns it in frequency order.
    assert "SEARCH samples USING PRIMARY KEY (result_id=?)" in steps
    assert not [step for step in steps if step.startswith("SCAN") or "TEMP B-TREE" in step]


def test_demand_history_is_found_by_index(session: Session, lens_rev2: Result):
    demand = service.create_from_finding(session, lens_rev2.id, "stiffen")
    assert demand is not None
    demand_id = demand.id

    steps = plans(session, lambda: demands.get_demand(session, demand_id))

    # The unique (component_id, revision_id) constraint is the index behind the history.
    assert "SEARCH results USING INDEX sqlite_autoindex_results_1 (component_id=?)" in steps
    assert not [step for step in steps if step.startswith("SCAN")]
