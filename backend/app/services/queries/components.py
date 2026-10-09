from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Component, Result, Revision
from app.services.comparison import delta, previous_present
from app.services.queries.types import RevisionEntry, RevisionResult, parse_warnings


def list_revisions(session: Session, component_id: int) -> list[RevisionEntry] | None:
    """One entry per revision of the component's project; `result` is None where it has none."""
    component = session.get(Component, component_id)
    if component is None:
        return None
    results = {
        result.revision_id: result
        for result in session.scalars(
            select(Result)
            .where(Result.component_id == component_id)
            .options(joinedload(Result.source_file))
        )
    }
    revisions = session.scalars(
        select(Revision)
        .where(Revision.project_id == component.project_id)
        .order_by(Revision.sort_key)
    ).all()
    found = [results.get(revision.id) for revision in revisions]
    return [
        RevisionEntry(
            revision_id=revision.id,
            revision_label=revision.label,
            sort_key=revision.sort_key,
            result=None
            if result is None
            else RevisionResult(
                **peak_fields(result, previous),
                source_status=result.source_file.status,
                warnings=parse_warnings(result.source_file.warnings),
            ),
        )
        for revision, result, previous in zip(revisions, found, previous_peaks(found), strict=True)
    ]


def previous_peaks(results: Sequence[Result | None]) -> list[float | None]:
    """Per position, the peak of the closest earlier result that exists."""
    return previous_present(
        [None if result is None else result.peak_magnitude_mm for result in results]
    )


def peak_fields(result: Result, previous_peak_mm: float | None) -> dict[str, Any]:
    """The `PeakResult` fields, shared by every per-revision result shape."""
    return {
        "result_id": result.id,
        "peak_magnitude_mm": result.peak_magnitude_mm,
        "peak_frequency_hz": result.peak_frequency_hz,
        "verdict": result.verdict,
        "margin_mm": round(result.margin_mm, 6),
        "delta_vs_previous_mm": delta(result.peak_magnitude_mm, previous_peak_mm),
    }
