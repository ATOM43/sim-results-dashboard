from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Component, Project, Result
from app.services.comparison import delta, grid_note, trend
from app.services.queries.components import peak_fields, previous_peaks
from app.services.queries.results import sample_points
from app.services.queries.types import (
    Comparison,
    ComparisonEntry,
    ComparisonResult,
    Matrix,
    MatrixCell,
    MatrixRow,
    NamedRef,
    RevisionRef,
)


class RevisionNotFoundError(LookupError):
    """A requested revision label does not exist in the component's project."""

    def __init__(self, label: str):
        super().__init__(label)
        self.label = label


def get_comparison(
    session: Session,
    component_id: int,
    labels: list[str] | None = None,
    baseline_label: str | None = None,
) -> Comparison | None:
    """Compare the component across the selected revisions, in `sort_key` order.

    Without `labels`, every revision where the component has a result is selected.
    The baseline defaults to the earliest selected revision.
    """
    component = session.get(Component, component_id)
    if component is None:
        return None
    project = component.project
    revisions = project.revisions  # ordered by sort_key
    known = {revision.label: revision for revision in revisions}
    for label in [*(labels or []), *([baseline_label] if baseline_label else [])]:
        if label not in known:
            raise RevisionNotFoundError(label)
    results = {
        result.revision_id: result
        for result in session.scalars(
            select(Result)
            .where(Result.component_id == component_id)
            .options(selectinload(Result.samples))
        )
    }
    if labels:
        selected = [revision for revision in revisions if revision.label in labels]
    else:
        selected = [revision for revision in revisions if revision.id in results]
    baseline = known[baseline_label] if baseline_label else selected[0] if selected else None
    baseline_result = None if baseline is None else results.get(baseline.id)
    baseline_peak = None if baseline_result is None else baseline_result.peak_magnitude_mm

    found = [results.get(revision.id) for revision in selected]
    entries: list[ComparisonEntry] = []
    for revision, result, previous in zip(selected, found, previous_peaks(found), strict=True):
        compared = None
        if result is not None:
            fields = peak_fields(result, previous)
            compared = ComparisonResult(
                **fields,
                delta_vs_baseline_mm=(
                    None
                    if result is baseline_result
                    else delta(result.peak_magnitude_mm, baseline_peak)
                ),
                trend=trend(fields["delta_vs_previous_mm"]),
                samples=sample_points(result),
            )
        entries.append(
            ComparisonEntry(
                revision_id=revision.id,
                revision_label=revision.label,
                sort_key=revision.sort_key,
                result=compared,
            )
        )

    note = grid_note(
        {
            revision.label: {
                sample.frequency_hz
                for sample in result.samples
                if sample.frequency_hz <= result.assess_max_hz
            }
            for revision, result in zip(selected, found, strict=True)
            if result is not None
        }
    )
    return Comparison(
        project=NamedRef(id=project.id, name=project.name),
        component=NamedRef(id=component.id, name=component.name),
        baseline_revision_label=None if baseline is None else baseline.label,
        grid_mismatch=note is not None,
        grid_note=note,
        revisions=entries,
    )


def get_matrix(session: Session, project_id: int) -> Matrix | None:
    """Every component against every revision; a cell is None where there is no result."""
    project = session.get(Project, project_id)
    if project is None:
        return None
    revisions = project.revisions  # ordered by sort_key
    results = {
        (result.component_id, result.revision_id): result
        for result in session.scalars(
            select(Result).join(Result.component).where(Component.project_id == project_id)
        )
    }
    rows: list[MatrixRow] = []
    for component in sorted(project.components, key=lambda component: component.name):
        found = [results.get((component.id, revision.id)) for revision in revisions]
        rows.append(
            MatrixRow(
                id=component.id,
                name=component.name,
                cells=[
                    None
                    if result is None
                    else MatrixCell(
                        revision_id=result.revision_id,
                        result_id=result.id,
                        peak_magnitude_mm=result.peak_magnitude_mm,
                        verdict=result.verdict,
                        trend=trend(delta(result.peak_magnitude_mm, previous)),
                    )
                    for result, previous in zip(found, previous_peaks(found), strict=True)
                ],
            )
        )
    return Matrix(
        project=NamedRef(id=project.id, name=project.name),
        revisions=[
            RevisionRef(id=revision.id, label=revision.label, sort_key=revision.sort_key)
            for revision in revisions
        ],
        components=rows,
    )
