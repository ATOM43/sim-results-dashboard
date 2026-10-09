import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.config import DEFAULT_PROJECT_NAME
from app.db import crud
from app.db.models import Component, Project, Result, Sample, SourceFile, utcnow
from app.services.assessment import AssessmentError, assess
from app.services.parsing import CsvValidationError, parse_csv

REVISION_DIR = re.compile(r"rev(\d+)")
GRID_WARNING = "frequency grid differs from other revisions of"


class FileOutcome(BaseModel):
    source_key: str
    outcome: Literal["inserted", "updated", "unchanged", "failed"]
    message: str
    warnings: list[str]


class ImportReport(BaseModel):
    inserted: int
    updated: int
    unchanged: int
    failed: int
    missing: list[str]
    skipped: list[str]
    files: list[FileOutcome]


def ingest_file(
    session: Session,
    *,
    project_name: str,
    revision_label: str,
    revision_sort_key: int,
    component_name: str,
    source_type: str,
    source_key: str,
    original_filename: str,
    stored_path: str,
    content: bytes,
) -> FileOutcome:
    """Import one CSV in its own transaction. Commits; rolls back on an unexpected error."""
    content_hash = hashlib.sha256(content).hexdigest()
    source_file = session.scalar(select(SourceFile).where(SourceFile.source_key == source_key))
    # Only a file that imported cleanly is skipped; failed or missing ones are parsed again.
    if (
        source_file is not None
        and source_file.status == "imported"
        and source_file.content_hash == content_hash
    ):
        warnings = json.loads(source_file.warnings or "[]")
        source_file.last_imported_at = utcnow()
        session.commit()
        return FileOutcome(
            source_key=source_key, outcome="unchanged", message="unchanged", warnings=warnings
        )

    try:
        if source_file is None:
            source_file = SourceFile(source_key=source_key)
        source_file.source_type = source_type
        source_file.original_filename = original_filename
        source_file.stored_path = stored_path
        source_file.content_hash = content_hash
        source_file.size_bytes = len(content)
        source_file.last_imported_at = utcnow()

        try:
            parsed = parse_csv(content, source_key)
            assessment = assess(parsed.samples)
        except (CsvValidationError, AssessmentError) as exc:
            # Any earlier result and its samples stay as they are: the last good data wins.
            source_file.status = "failed"
            source_file.error_message = str(exc)
            session.add(source_file)
            session.commit()
            return FileOutcome(
                source_key=source_key, outcome="failed", message=str(exc), warnings=[]
            )

        project = crud.get_or_create_project(session, project_name)
        component = crud.get_or_create_component(session, project.id, component_name)
        revision = crud.get_or_create_revision(
            session, project.id, revision_label, revision_sort_key
        )
        if component.project_id != revision.project_id:
            raise ValueError(
                f"{source_key}: component {component_name!r} and revision {revision_label!r} "
                "must belong to the same project"
            )

        source_file.status = "imported"
        source_file.error_message = None
        source_file.warnings = json.dumps(list(parsed.warnings))
        session.add(source_file)

        result = crud.get_result(session, component.id, revision.id)
        outcome: Literal["inserted", "updated"] = "inserted" if result is None else "updated"
        if result is None:
            result = Result(component_id=component.id, revision_id=revision.id)
            session.add(result)
        result.source_file = source_file
        for field, value in asdict(assessment).items():
            setattr(result, field, value)
        result.updated_at = utcnow()
        session.flush()

        session.execute(delete(Sample).where(Sample.result_id == result.id))
        session.execute(
            insert(Sample),
            [
                {"result_id": result.id, "frequency_hz": frequency, "magnitude_mm": magnitude}
                for frequency, magnitude in parsed.samples
            ],
        )
        session.commit()
    except Exception:
        session.rollback()
        raise

    return FileOutcome(
        source_key=source_key,
        outcome=outcome,
        message=(
            f"{assessment.verdict}: peak {assessment.peak_magnitude_mm:g} mm "
            f"at {assessment.peak_frequency_hz:g} Hz"
        ),
        warnings=list(parsed.warnings),
    )


def _update_grid_warnings(session: Session, project_name: str) -> dict[str, list[str]]:
    """Flag results whose frequencies differ from most revisions of the same component.

    Returns the final warnings of every source file that has a result in the project.
    """
    grids: defaultdict[int, set[float]] = defaultdict(set)
    for result_id, frequency in session.execute(select(Sample.result_id, Sample.frequency_hz)):
        grids[result_id].add(frequency)

    by_component: defaultdict[Component, list[Result]] = defaultdict(list)
    for result in session.scalars(
        select(Result)
        .join(Result.component)
        .join(Component.project)
        .where(Project.name == project_name)
    ):
        by_component[result.component].append(result)

    warnings: dict[str, list[str]] = {}
    for component, results in by_component.items():
        counts = Counter(frozenset(grids[result.id]) for result in results)
        top = max(counts.values())
        common = {grid for grid, count in counts.items() if count == top}
        # Without a single most-used grid there is nothing to name the differences against.
        reference = next(iter(common)) if len(common) == 1 else None
        for result in results:
            grid = frozenset(grids[result.id])
            warning = None
            if reference is None and len(counts) > 1:
                warning = f"{GRID_WARNING} {component.name}"
            elif reference is not None and grid != reference:
                details = [
                    f"{verb} {', '.join(f'{frequency:g} Hz' for frequency in sorted(points))}"
                    for verb, points in (("has", grid - reference), ("lacks", reference - grid))
                    if points
                ]
                warning = f"{GRID_WARNING} {component.name}: {', '.join(details)}"
            source_file = result.source_file
            kept = [
                warning
                for warning in json.loads(source_file.warnings or "[]")
                if not warning.startswith(GRID_WARNING)
            ]
            final = [*kept, warning] if warning else kept
            source_file.warnings = json.dumps(final)
            warnings[source_file.source_key] = final
    return warnings


def sync_folder(
    session: Session, inputs_dir: Path, project_name: str = DEFAULT_PROJECT_NAME
) -> ImportReport:
    """Import every `rev<number>/*.csv` under `inputs_dir`, then mark files that are gone."""
    revisions: list[tuple[int, Path]] = []
    skipped: list[str] = []
    for folder in sorted(inputs_dir.iterdir()):
        if not folder.is_dir():
            continue
        match = REVISION_DIR.fullmatch(folder.name)
        if match:
            revisions.append((int(match[1]), folder))
        elif folder.name.lower().startswith("rev"):
            skipped.append(folder.name)

    files: list[FileOutcome] = []
    for sort_key, folder in sorted(revisions):
        for path in sorted(folder.glob("*.csv")):
            if not path.is_file():
                continue
            source_key = f"{folder.name}/{path.name}"
            try:
                content = path.read_bytes()
            except OSError as exc:
                # Without content there is no hash to store, so the database is left as it is.
                files.append(
                    FileOutcome(
                        source_key=source_key,
                        outcome="failed",
                        message=f"cannot read file: {exc.strerror or exc}",
                        warnings=[],
                    )
                )
                continue
            files.append(
                ingest_file(
                    session,
                    project_name=project_name,
                    revision_label=folder.name,
                    revision_sort_key=sort_key,
                    component_name=path.stem,
                    source_type="folder",
                    source_key=source_key,
                    original_filename=path.name,
                    stored_path=str(path.resolve()),
                    content=content,
                )
            )

    # Results and samples of missing files are kept: demands reference them.
    missing: list[str] = []
    for source_file in session.scalars(
        select(SourceFile)
        .where(
            SourceFile.source_type == "folder",
            SourceFile.source_key.not_in([file.source_key for file in files]),
        )
        .order_by(SourceFile.source_key)
    ):
        source_file.status = "missing"
        missing.append(source_file.source_key)
    warnings = _update_grid_warnings(session, project_name)
    session.commit()

    for file in files:
        file.warnings = warnings.get(file.source_key, file.warnings)
    outcomes = Counter(file.outcome for file in files)
    return ImportReport(
        inserted=outcomes["inserted"],
        updated=outcomes["updated"],
        unchanged=outcomes["unchanged"],
        failed=outcomes["failed"],
        missing=missing,
        skipped=skipped,
        files=files,
    )
