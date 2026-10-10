import os
import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app import cli, config
from app.db import crud
from app.db.base import get_session, init_db
from app.db.models import Component, Project, Result, Revision, Sample, SourceFile
from app.main import app
from app.services import ingestion
from app.services.ingestion import ingest_file, sync_folder

HEADER = "Frequency [Hz],Magnitude [mm]\n"


def count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def source_file(session: Session, source_key: str) -> SourceFile:
    return session.scalars(select(SourceFile).where(SourceFile.source_key == source_key)).one()


def result_for(session: Session, source_key: str) -> Result:
    return session.scalars(
        select(Result).join(Result.source_file).where(SourceFile.source_key == source_key)
    ).one()


def sample_count(session: Session, result_id: int) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Sample).where(Sample.result_id == result_id)
        )
        or 0
    )


def test_first_run_imports_everything(session: Session, inputs: Path):
    report = sync_folder(session, inputs)

    assert (report.inserted, report.updated, report.unchanged, report.failed) == (9, 0, 0, 0)
    assert (report.missing, report.skipped) == ([], [])
    assert [count(session, m) for m in (Project, Component, Revision, Result, Sample)] == [
        1,
        3,
        3,
        9,
        135,
    ]
    assert session.scalars(select(Project.name)).one() == config.DEFAULT_PROJECT_NAME
    bracket = result_for(session, "rev1/Bracket.csv")
    assert (bracket.peak_magnitude_mm, bracket.peak_frequency_hz, bracket.verdict) == (
        pytest.approx(19.9),
        pytest.approx(37.6),
        "FAIL",
    )


def test_second_run_changes_nothing(session: Session, inputs: Path):
    sync_folder(session, inputs)
    before = session.execute(select(Result.id, Result.updated_at).order_by(Result.id)).all()

    report = sync_folder(session, inputs)

    assert (report.inserted, report.updated, report.unchanged, report.failed) == (0, 0, 9, 0)
    assert session.execute(select(Result.id, Result.updated_at).order_by(Result.id)).all() == before
    assert count(session, Sample) == 135


def test_edited_csv_updates_its_result_in_place(session: Session, inputs: Path):
    sync_folder(session, inputs)
    result_id = result_for(session, "rev3/Bracket.csv").id
    (inputs / "rev3/Bracket.csv").write_text(HEADER + "5.0,1.0\n37.8,21.5\n200.0,0.5\n")

    report = sync_folder(session, inputs)

    assert (report.inserted, report.updated, report.unchanged, report.failed) == (0, 1, 8, 0)
    result = result_for(session, "rev3/Bracket.csv")
    assert result.id == result_id
    assert (result.peak_magnitude_mm, result.peak_frequency_hz, result.verdict) == (
        21.5,
        37.8,
        "FAIL",
    )
    assert result.sample_count == 3
    assert sample_count(session, result_id) == 3
    assert count(session, Result) == 9


def test_new_revision_folder_is_picked_up(session: Session, inputs: Path):
    sync_folder(session, inputs)
    (inputs / "rev4").mkdir()
    shutil.copy(inputs / "rev3/Bracket.csv", inputs / "rev4/Bracket.csv")

    report = sync_folder(session, inputs)

    assert (report.inserted, report.updated, report.unchanged, report.failed) == (1, 0, 9, 0)
    assert session.scalars(select(Revision.sort_key).where(Revision.label == "rev4")).one() == 4


def test_broken_csv_fails_alone(session: Session, inputs: Path):
    (inputs / "rev2/Lens.csv").write_text(HEADER + "5.0,abc\n200.0,0.5\n")

    report = sync_folder(session, inputs)

    assert (report.inserted, report.failed) == (8, 1)
    (failed,) = [file for file in report.files if file.outcome == "failed"]
    assert failed.source_key == "rev2/Lens.csv"
    assert failed.message == "rev2/Lens.csv line 2: magnitude 'abc' is not a number"
    stored = source_file(session, "rev2/Lens.csv")
    assert (stored.status, stored.error_message) == ("failed", failed.message)
    assert count(session, Result) == 8


def test_broken_replacement_keeps_the_last_good_result(session: Session, inputs: Path):
    sync_folder(session, inputs)
    good = result_for(session, "rev2/Lens.csv")
    good_id, good_peak, good_updated_at = good.id, good.peak_magnitude_mm, good.updated_at
    (inputs / "rev2/Lens.csv").write_bytes(b"not a csv")

    first = sync_folder(session, inputs)
    second = sync_folder(session, inputs)  # still broken: must not turn into "unchanged"

    assert (first.failed, first.unchanged) == (1, 8)
    assert (second.failed, second.unchanged) == (1, 8)
    assert source_file(session, "rev2/Lens.csv").status == "failed"
    result = result_for(session, "rev2/Lens.csv")
    assert (result.id, result.peak_magnitude_mm, result.updated_at) == (
        good_id,
        good_peak,
        good_updated_at,
    )
    assert sample_count(session, good_id) == 15


@pytest.mark.skipif(
    sys.platform == "win32" or (hasattr(os, "geteuid") and os.geteuid() == 0),
    reason="needs POSIX file permissions and a non-root user",
)
def test_unreadable_csv_fails_alone(session: Session, inputs: Path):
    (inputs / "rev2/Lens.csv").chmod(0o000)

    report = sync_folder(session, inputs)

    assert (report.inserted, report.failed, report.missing) == (8, 1, [])
    (failed,) = [file for file in report.files if file.outcome == "failed"]
    assert failed.source_key == "rev2/Lens.csv"
    assert failed.message == "cannot read file: Permission denied"
    assert count(session, Result) == 8


def test_deleted_csv_becomes_missing_but_keeps_its_data(session: Session, inputs: Path):
    sync_folder(session, inputs)
    result_id = result_for(session, "rev1/Housing.csv").id
    (inputs / "rev1/Housing.csv").unlink()

    report = sync_folder(session, inputs)

    assert report.missing == ["rev1/Housing.csv"]
    assert (report.unchanged, report.failed) == (8, 0)
    assert source_file(session, "rev1/Housing.csv").status == "missing"
    assert count(session, Result) == 9
    assert sample_count(session, result_id) == 15


def test_everything_that_is_not_a_revision_csv_is_ignored(session: Session, inputs: Path):
    (inputs / "rev1/notes.txt").write_text("hello")
    (inputs / "rev1/deeper").mkdir()
    shutil.copy(inputs / "rev1/Lens.csv", inputs / "rev1/deeper/Lens.csv")
    (inputs / "rev1/folder.csv").mkdir()  # a directory that only looks like a CSV
    (inputs / "misc").mkdir()
    shutil.copy(inputs / "rev1/Lens.csv", inputs / "misc/Lens.csv")
    (inputs / "rev-old").mkdir()
    shutil.copy(inputs / "rev1/Lens.csv", inputs / "rev-old/Lens.csv")
    assert (inputs / "Bracket.png").is_file()

    report = sync_folder(session, inputs)

    assert len(report.files) == report.inserted == 9
    assert report.skipped == ["rev-old"]
    assert count(session, SourceFile) == 9


def test_rev10_sorts_after_rev9(session: Session, inputs: Path):
    shutil.copytree(inputs / "rev3", inputs / "rev9")
    shutil.copytree(inputs / "rev3", inputs / "rev10")

    sync_folder(session, inputs)

    labels = session.scalars(select(Revision.label).order_by(Revision.sort_key)).all()
    assert labels == ["rev1", "rev2", "rev3", "rev9", "rev10"]


def test_grid_warnings_name_the_differing_points(session: Session, inputs: Path):
    prefix = "frequency grid differs from other revisions of"
    expected = {
        "rev1/Bracket.csv": [f"{prefix} Bracket: has 37.6 Hz, lacks 37.8 Hz"],
        "rev1/Housing.csv": [f"{prefix} Housing: has 37.6 Hz, lacks 37.8 Hz"],
        "rev1/Lens.csv": [f"{prefix} Lens: has 36.8 Hz, lacks 44.3 Hz"],
    }

    for _ in range(2):  # the second run must not stack duplicate warnings
        report = sync_folder(session, inputs)

        assert {f.source_key: f.warnings for f in report.files if f.warnings} == expected
    assert session.scalars(
        select(SourceFile.source_key)
        .where(SourceFile.warnings != "[]")
        .order_by(SourceFile.source_key)
    ).all() == list(expected)


def test_grid_warning_without_a_majority_flags_every_revision(session: Session, inputs: Path):
    shutil.rmtree(inputs / "rev3")

    report = sync_folder(session, inputs)

    assert {f.source_key: f.warnings for f in report.files if "Bracket" in f.source_key} == {
        "rev1/Bracket.csv": ["frequency grid differs from other revisions of Bracket"],
        "rev2/Bracket.csv": ["frequency grid differs from other revisions of Bracket"],
    }


def test_revision_from_another_project_is_rejected(
    session: Session, inputs: Path, monkeypatch: pytest.MonkeyPatch
):
    other = crud.get_or_create_project(session, "Other Product")
    foreign_revision = crud.get_or_create_revision(session, other.id, "rev1", 1)
    session.commit()
    monkeypatch.setattr(ingestion.crud, "get_or_create_revision", lambda *_args: foreign_revision)

    with pytest.raises(ValueError, match="must belong to the same project"):
        ingest_file(
            session,
            project_name="Demo Product",
            revision_label="rev1",
            revision_sort_key=1,
            component_name="Bracket",
            source_type="folder",
            source_key="rev1/Bracket.csv",
            original_filename="Bracket.csv",
            stored_path="rev1/Bracket.csv",
            content=(inputs / "rev1/Bracket.csv").read_bytes(),
        )

    assert [count(session, m) for m in (SourceFile, Result, Component)] == [0, 0, 0]


def test_post_import_returns_the_report(
    session: Session, inputs: Path, monkeypatch: pytest.MonkeyPatch
):
    def override_session():
        with Session(session.get_bind()) as request_session:
            yield request_session

    monkeypatch.setattr(config, "INPUTS_DIR", inputs)
    monkeypatch.setitem(app.dependency_overrides, get_session, override_session)

    response = TestClient(app).post("/api/import")

    assert response.status_code == 200
    body = response.json()
    assert (body["inserted"], body["updated"], body["unchanged"], body["failed"]) == (9, 0, 0, 0)
    assert (body["missing"], body["skipped"]) == ([], [])
    assert len(body["files"]) == 9
    assert body["files"][0] == {
        "source_key": "rev1/Bracket.csv",
        "outcome": "inserted",
        "message": "FAIL: peak 19.9 mm at 37.6 Hz",
        "warnings": [
            "frequency grid differs from other revisions of Bracket: has 37.6 Hz, lacks 37.8 Hz"
        ],
    }
    assert count(session, Result) == 9


def test_post_import_without_inputs_folder_returns_503(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(config, "INPUTS_DIR", tmp_path / "nowhere")

    response = TestClient(app).post("/api/import")

    assert response.status_code == 503
    assert response.json() == {"detail": f"inputs folder not found: {tmp_path / 'nowhere'}"}


def test_cli_exit_code(
    session: Session, inputs: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
):
    engine = session.get_bind()
    monkeypatch.setattr(cli, "SessionLocal", sessionmaker(engine))
    monkeypatch.setattr(cli, "init_db", lambda: init_db(engine))  # type: ignore[arg-type]

    assert cli.main(["import", "--inputs", str(inputs)]) == 0
    assert "Total: 9 inserted, 0 updated, 0 unchanged, 0 failed" in capsys.readouterr().out

    (inputs / "rev2/Lens.csv").write_bytes(b"not a csv")

    assert cli.main(["import", "--inputs", str(inputs)]) == 1
    out = capsys.readouterr().out
    assert "failed    rev2/Lens.csv" in out
    assert "Total: 0 inserted, 0 updated, 8 unchanged, 1 failed" in out
