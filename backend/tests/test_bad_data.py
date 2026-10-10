"""T16: data that cannot be assessed is reported by name and never becomes a result."""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.db.models import Component, Result, Revision, Sample, SourceFile
from app.services.ingestion import sync_folder

HEADER = "Frequency [Hz],Magnitude [mm]\n"

# One problem per file: source key -> (content, the exact message it must produce).
BROKEN = {
    "rev5/Bracket.csv": (
        "Freq,Mag\n5.0,1.0\n200.0,0.5\n",
        "rev5/Bracket.csv line 1: header must be exactly 'Frequency [Hz],Magnitude [mm]', "
        "found 'Freq,Mag'",
    ),
    "rev5/Housing.csv": (
        HEADER + "5.0,abc\n200.0,0.5\n",
        "rev5/Housing.csv line 2: magnitude 'abc' is not a number",
    ),
    "rev5/Lens.csv": (
        HEADER + "5.0,1.0\n5.0,1.2\n200.0,0.5\n",
        "rev5/Lens.csv line 3: duplicate frequency 5 Hz (already on line 2)",
    ),
    "rev5/Cover.csv": (
        HEADER + "5.0,1.0\n40.0,2.0\n",
        "rev5/Cover.csv line 3: data ends at 40 Hz, before the 50 Hz cutoff; cannot be assessed",
    ),
    "rev5/Mount.csv": ("", "rev5/Mount.csv: file is empty"),
}
GOOD_FILES = 11  # the 9 supplied files plus rev4 without Housing


@pytest.fixture
def bad_inputs(inputs: Path) -> Path:
    """The supplied data, a valid rev4 that lacks Housing, and a rev5 of broken files."""
    (inputs / "rev4").mkdir()
    for name in ("Bracket.csv", "Lens.csv"):
        shutil.copy(inputs / "rev3" / name, inputs / "rev4" / name)
    (inputs / "rev5").mkdir()
    for source_key, (content, _) in BROKEN.items():
        (inputs / source_key).write_text(content)
    return inputs


def count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


@pytest.mark.parametrize("source_key", BROKEN)
def test_broken_file_is_reported_and_writes_no_result(
    session: Session, bad_inputs: Path, source_key: str
):
    report = sync_folder(session, bad_inputs)

    (outcome,) = [file for file in report.files if file.source_key == source_key]
    assert (outcome.outcome, outcome.message) == ("failed", BROKEN[source_key][1])
    stored = session.scalars(select(SourceFile).where(SourceFile.source_key == source_key)).one()
    assert (stored.status, stored.error_message) == ("failed", BROKEN[source_key][1])
    assert session.scalars(select(Result).where(Result.source_file_id == stored.id)).all() == []
    assert count(session, Sample) == GOOD_FILES * 15  # only the good files' samples


def test_good_and_bad_files_coexist(session: Session, bad_inputs: Path):
    first = sync_folder(session, bad_inputs)
    second = sync_folder(session, bad_inputs)

    assert (first.inserted, first.updated, first.unchanged, first.failed) == (GOOD_FILES, 0, 0, 5)
    # A broken file is parsed again every run; it must never settle into "unchanged".
    assert (second.inserted, second.updated, second.unchanged, second.failed) == (
        0,
        0,
        GOOD_FILES,
        5,
    )
    assert {f.source_key: f.message for f in second.files if f.outcome == "failed"} == {
        key: message for key, (_, message) in BROKEN.items()
    }
    assert count(session, Result) == GOOD_FILES
    # Nothing in rev5 could be assessed, so neither the revision nor its new components exist.
    assert session.scalars(select(Revision.label).order_by(Revision.sort_key)).all() == [
        "rev1",
        "rev2",
        "rev3",
        "rev4",
    ]
    assert sorted(session.scalars(select(Component.name))) == ["Bracket", "Housing", "Lens"]


def test_api_reports_every_failure_and_invents_no_result(
    client: TestClient, bad_inputs: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(config, "INPUTS_DIR", bad_inputs)

    report = client.post("/api/import").json()
    status = client.get("/api/import/status").json()

    assert (report["inserted"], report["updated"], report["unchanged"], report["failed"]) == (
        GOOD_FILES,
        0,
        0,
        5,
    )
    assert status["counts"] == {"imported": GOOD_FILES, "failed": 5, "missing": 0}
    assert {
        f["source_key"]: f["error_message"] for f in status["files"] if f["status"] != "imported"
    } == {key: message for key, (_, message) in BROKEN.items()}

    project_id = client.get("/api/projects").json()[0]["id"]
    components = client.get(f"/api/projects/{project_id}/components").json()
    housing = next(c for c in components if c["name"] == "Housing")
    assert housing["latest"]["revision_label"] == "rev3"

    revisions = client.get(f"/api/components/{housing['id']}/revisions").json()
    assert [(r["revision_label"], r["result"] is None) for r in revisions] == [
        ("rev1", False),
        ("rev2", False),
        ("rev3", False),
        ("rev4", True),
    ]
    compared = client.get(f"/api/components/{housing['id']}/comparison?revisions=rev3,rev4").json()
    assert [r["result"] is None for r in compared["revisions"]] == [False, True]

    matrix = client.get(f"/api/projects/{project_id}/matrix").json()
    assert [r["label"] for r in matrix["revisions"]] == ["rev1", "rev2", "rev3", "rev4"]
    cells = {row["name"]: row["cells"] for row in matrix["components"]}
    assert cells["Housing"][3] is None
    assert all(cell is not None for name in ("Bracket", "Lens") for cell in cells[name])
