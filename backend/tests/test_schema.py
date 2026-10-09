import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import crud
from app.db.models import Component, Demand, Result, Revision, Sample, SourceFile


def make_source_file(session: Session, key: str = "rev1/Bracket.csv", **overrides) -> SourceFile:
    fields = {
        "source_type": "folder",
        "source_key": key,
        "original_filename": "Bracket.csv",
        "stored_path": f"Inputs/{key}",
        "content_hash": "abc123",
        "size_bytes": 100,
        "status": "imported",
    } | overrides
    source_file = SourceFile(**fields)
    session.add(source_file)
    session.flush()
    return source_file


def make_component_and_revision(session: Session) -> tuple[Component, Revision]:
    project = crud.get_or_create_project(session, "Demo")
    component = crud.get_or_create_component(session, project.id, "Bracket")
    revision = crud.get_or_create_revision(session, project.id, "rev1", 1)
    return component, revision


def make_result(session: Session, source_key: str = "rev1/Bracket.csv", **overrides) -> Result:
    component, revision = make_component_and_revision(session)
    fields = {
        "component_id": component.id,
        "revision_id": revision.id,
        "source_file_id": make_source_file(session, source_key).id,
        "sample_count": 2,
        "min_frequency_hz": 10.0,
        "max_frequency_hz": 60.0,
        "peak_magnitude_mm": 19.9,
        "peak_frequency_hz": 37.6,
        "overall_peak_magnitude_mm": 19.9,
        "overall_peak_frequency_hz": 37.6,
        "limit_mm": 15.0,
        "assess_max_hz": 50.0,
        "verdict": "FAIL",
    } | overrides
    result = Result(**fields)
    session.add(result)
    session.flush()
    return result


def finding_demand(result: Result, **overrides) -> Demand:
    fields = {
        "component_id": result.component_id,
        "description": "Stiffen the bracket",
        "origin_type": "finding",
        "origin_result_id": result.id,
        "origin_revision_label": "rev1",
        "origin_metric": "peak_magnitude_mm",
        "origin_value_mm": 19.9,
        "origin_frequency_hz": 37.6,
        "origin_limit_mm": 15.0,
        "origin_assess_max_hz": 50.0,
    } | overrides
    return Demand(**fields)


def test_fresh_database_has_all_tables_and_indexes(session: Session):
    rows = session.execute(text("SELECT type, name, sql FROM sqlite_master")).all()
    tables = {name: sql for kind, name, sql in rows if kind == "table"}
    indexes = {name for kind, name, _ in rows if kind == "index"}

    assert set(tables) == {
        "projects",
        "components",
        "revisions",
        "source_files",
        "results",
        "samples",
        "demands",
    }
    assert {"idx_results_revision", "idx_demands_component", "idx_demands_status"} <= indexes
    assert "WITHOUT ROWID" in tables["samples"]
    assert "ON DELETE CASCADE" in tables["samples"]
    assert "UNIQUE (component_id, revision_id)" in tables["results"]
    assert "CHECK (verdict IN ('PASS','FAIL'))" in tables["results"]
    assert "DEFAULT 'Open'" in tables["demands"]


def test_foreign_keys_are_enforced(session: Session):
    assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_get_or_create_returns_the_existing_row(session: Session):
    first = crud.get_or_create_project(session, "Demo")
    second = crud.get_or_create_project(session, "Demo")

    assert first.id == second.id


def test_get_result_finds_by_component_and_revision(session: Session):
    result = make_result(session)

    assert crud.get_result(session, result.component_id, result.revision_id) is result
    assert crud.get_result(session, result.component_id, 999) is None


def test_timestamps_are_set_and_timezone_aware(session: Session):
    result = make_result(session)
    session.expire(result)

    assert result.created_at.tzinfo is not None
    assert result.updated_at.tzinfo is not None


def test_duplicate_result_is_rejected(session: Session):
    make_result(session)

    with pytest.raises(IntegrityError, match="results.component_id, results.revision_id"):
        make_result(session, source_key="uploads/Bracket-again.csv")


def test_duplicate_sample_is_rejected(session: Session):
    result = make_result(session)
    session.add(Sample(result_id=result.id, frequency_hz=10.0, magnitude_mm=1.0))
    session.flush()

    session.add(Sample(result_id=result.id, frequency_hz=10.0, magnitude_mm=2.0))
    with pytest.raises(IntegrityError, match="samples.result_id, samples.frequency_hz"):
        session.flush()


def test_deleting_a_result_removes_its_samples(session: Session):
    result = make_result(session)
    session.add_all(
        [
            Sample(result_id=result.id, frequency_hz=10.0, magnitude_mm=1.0),
            Sample(result_id=result.id, frequency_hz=20.0, magnitude_mm=2.0),
        ]
    )
    session.flush()

    # Core delete bypasses the ORM cascade, so only the database's ON DELETE CASCADE can do this.
    session.execute(delete(Result).where(Result.id == result.id))

    assert session.scalar(select(func.count()).select_from(Sample)) == 0


@pytest.mark.parametrize(
    "missing",
    [
        "origin_result_id",
        "origin_revision_label",
        "origin_metric",
        "origin_value_mm",
        "origin_frequency_hz",
        "origin_limit_mm",
        "origin_assess_max_hz",
    ],
)
def test_finding_demand_with_a_missing_origin_field_is_rejected(session: Session, missing: str):
    result = make_result(session)

    session.add(finding_demand(result, **{missing: None}))
    with pytest.raises(IntegrityError, match="ck_demands_finding_origin"):
        session.flush()


def test_complete_finding_demand_is_accepted(session: Session):
    result = make_result(session)
    demand = finding_demand(result)

    session.add(demand)
    session.flush()

    assert demand.status == "Open"


def test_manual_demand_without_origin_is_accepted(session: Session):
    component, _ = make_component_and_revision(session)
    demand = Demand(component_id=component.id, description="Check welds", origin_type="manual")

    session.add(demand)
    session.flush()

    assert demand.id is not None


def test_invalid_demand_status_is_rejected(session: Session):
    component, _ = make_component_and_revision(session)

    session.add(
        Demand(
            component_id=component.id,
            description="Check welds",
            origin_type="manual",
            status="In progress",
        )
    )
    with pytest.raises(IntegrityError, match="ck_demands_status"):
        session.flush()


def test_invalid_verdict_is_rejected(session: Session):
    with pytest.raises(IntegrityError, match="ck_results_verdict"):
        make_result(session, verdict="MAYBE")


def test_invalid_source_file_status_is_rejected(session: Session):
    with pytest.raises(IntegrityError, match="ck_source_files_status"):
        make_source_file(session, status="deleted")
