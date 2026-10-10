from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app import cli
from app.db.base import init_db
from app.db.models import Demand, Result, Revision, SourceFile
from app.services import demands as service
from app.services.ingestion import sync_folder
from app.services.queries import demands as queries


def result_for(session: Session, source_key: str) -> Result:
    return session.scalars(
        select(Result).join(Result.source_file).where(SourceFile.source_key == source_key)
    ).one()


def count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Demand)) or 0


@pytest.fixture
def data(session: Session, inputs: Path) -> Session:
    sync_folder(session, inputs)
    return session


def test_create_from_finding_copies_the_result(data: Session):
    result = result_for(data, "rev2/Lens.csv")

    demand = service.create_from_finding(data, result.id, "stiffen")

    assert demand is not None
    assert (demand.status, demand.description, demand.origin_type) == ("Open", "stiffen", "finding")
    assert (demand.component_id, demand.origin_result_id) == (result.component_id, result.id)
    assert (demand.origin_revision_label, demand.origin_metric) == ("rev2", "peak_magnitude")
    assert (
        demand.origin_value_mm,
        demand.origin_frequency_hz,
        demand.origin_limit_mm,
        demand.origin_assess_max_hz,
    ) == pytest.approx((16.1, 37.8, 15.0, 50.0))


def test_create_rules(data: Session):
    passing = result_for(data, "rev3/Bracket.csv")

    with pytest.raises(service.DemandError, match="cannot raise a demand from a passing result"):
        service.create_from_finding(data, passing.id, "x")
    assert service.create_from_finding(data, 999, "x") is None
    assert service.create_manual(data, 999, "x") is None
    assert count(data) == 0


def test_history_of_a_rev2_origin_does_not_show_rev1(data: Session):
    demand = service.create_from_finding(data, result_for(data, "rev2/Lens.csv").id, "x")
    assert demand is not None

    detail = queries.get_demand(data, demand.id)

    assert detail is not None
    assert [e.revision_label for e in detail.history] == ["rev2", "rev3"]
    assert [e.peak_magnitude_mm for e in detail.history] == pytest.approx([16.1, 17.5])
    assert detail.latest_result == detail.history[-1]
    assert detail.latest_passes_but_open is False


def test_history_follows_sort_key_not_label(data: Session):
    """rev10 sorts after rev2 by `sort_key`, though not as text."""
    demand = service.create_from_finding(data, result_for(data, "rev2/Lens.csv").id, "x")
    assert demand is not None
    project_id = demand.component.project_id
    data.add(Revision(project_id=project_id, label="rev10", sort_key=10))
    data.commit()

    detail = queries.get_demand(data, demand.id)

    assert detail is not None
    assert [e.revision_label for e in detail.history] == ["rev2", "rev3", "rev10"]
    assert detail.history[-1].result_id is None
    assert detail.latest_result is not None and detail.latest_result.revision_label == "rev3"


def test_update_never_touches_status_implicitly(data: Session):
    demand = service.create_from_finding(data, result_for(data, "rev1/Bracket.csv").id, "x")
    assert demand is not None

    updated = service.update_demand(data, demand.id, description="new")
    assert updated is not None and (updated.description, updated.status) == ("new", "Open")

    updated = service.update_demand(data, demand.id, status="Resolved")
    assert updated is not None and (updated.description, updated.status) == ("new", "Resolved")

    assert service.update_demand(data, 999, status="Open") is None


def test_seed_creates_one_demand_per_rev1_fail(data: Session):
    demands, skipped = service.seed_demands(data)

    assert [(d.component.name, d.origin_revision_label) for d in demands] == [
        ("Bracket", "rev1"),
        ("Housing", "rev1"),
        ("Lens", "rev1"),
    ]
    assert [d.origin_value_mm for d in demands] == pytest.approx([19.9, 16.7, 18.0])
    assert (skipped, count(data)) == ([], 3)


def test_seed_twice_skips_existing_finding_demands(data: Session):
    first, _ = service.seed_demands(data)
    # A manual demand on the same component does not count as existing.
    service.create_manual(data, first[0].component_id, "x")

    created, skipped = service.seed_demands(data)

    assert created == []
    assert [d.id for d in skipped] == [d.id for d in first]
    assert count(data) == 4


def test_seed_fills_in_only_the_missing_demands(data: Session):
    lens = service.create_from_finding(data, result_for(data, "rev1/Lens.csv").id, "x")

    created, skipped = service.seed_demands(data)

    assert [d.component.name for d in created] == ["Bracket", "Housing"]
    assert skipped == [lens]
    assert count(data) == 3


def test_cli_seed_demands(
    session: Session, inputs: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
):
    engine = session.get_bind()
    monkeypatch.setattr(cli, "SessionLocal", sessionmaker(engine))
    monkeypatch.setattr(cli, "init_db", lambda: init_db(engine))  # type: ignore[arg-type]

    assert cli.main(["seed-demands"]) == 0
    assert "No rev1 FAIL results found" in capsys.readouterr().out
    assert count(session) == 0

    sync_folder(session, inputs)
    assert cli.main(["seed-demands"]) == 0
    assert capsys.readouterr().out.count("created   demand") == 3
    assert count(session) == 3

    assert cli.main(["seed-demands"]) == 0
    out = capsys.readouterr().out
    assert (out.count("skipped (exists)"), out.count("created")) == (3, 0)
    assert count(session) == 3
