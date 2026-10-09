from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Component, Result, Revision
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
    entries: list[RevisionEntry] = []
    previous: Result | None = None  # closest earlier revision that has a result
    for revision in session.scalars(
        select(Revision)
        .where(Revision.project_id == component.project_id)
        .order_by(Revision.sort_key)
    ):
        result = results.get(revision.id)
        entries.append(
            RevisionEntry(
                revision_id=revision.id,
                revision_label=revision.label,
                sort_key=revision.sort_key,
                result=None if result is None else _revision_result(result, previous),
            )
        )
        if result is not None:
            previous = result
    return entries


def _revision_result(result: Result, previous: Result | None) -> RevisionResult:
    return RevisionResult(
        result_id=result.id,
        peak_magnitude_mm=result.peak_magnitude_mm,
        peak_frequency_hz=result.peak_frequency_hz,
        verdict=result.verdict,
        margin_mm=round(result.margin_mm, 6),
        delta_vs_previous_mm=(
            None
            if previous is None
            else round(result.peak_magnitude_mm - previous.peak_magnitude_mm, 6)
        ),
        source_status=result.source_file.status,
        warnings=parse_warnings(result.source_file.warnings),
    )
