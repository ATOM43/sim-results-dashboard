from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.models import Component, Result
from app.services.queries.types import (
    NamedRef,
    ResultDetail,
    ResultSource,
    RevisionRef,
    SamplePoint,
    parse_warnings,
)


def get_result(session: Session, result_id: int) -> ResultDetail | None:
    result = session.scalar(
        select(Result)
        .where(Result.id == result_id)
        .options(
            joinedload(Result.component).joinedload(Component.project),
            joinedload(Result.revision),
            joinedload(Result.source_file),
            selectinload(Result.samples),
        )
    )
    if result is None:
        return None
    component, revision, source = result.component, result.revision, result.source_file
    return ResultDetail(
        id=result.id,
        project=NamedRef(id=component.project.id, name=component.project.name),
        component=NamedRef(id=component.id, name=component.name),
        revision=RevisionRef(id=revision.id, label=revision.label, sort_key=revision.sort_key),
        sample_count=result.sample_count,
        min_frequency_hz=result.min_frequency_hz,
        max_frequency_hz=result.max_frequency_hz,
        peak_magnitude_mm=result.peak_magnitude_mm,
        peak_frequency_hz=result.peak_frequency_hz,
        overall_peak_magnitude_mm=result.overall_peak_magnitude_mm,
        overall_peak_frequency_hz=result.overall_peak_frequency_hz,
        # limit_mm and assess_max_hz are the stored ones: the rule the verdict was judged by.
        limit_mm=result.limit_mm,
        assess_max_hz=result.assess_max_hz,
        verdict=result.verdict,
        margin_mm=round(result.margin_mm, 6),
        samples=sample_points(result),
        source=ResultSource(
            source_key=source.source_key,
            status=source.status,
            warnings=parse_warnings(source.warnings),
            last_imported_at=source.last_imported_at,
        ),
    )


def sample_points(result: Result) -> list[SamplePoint]:
    """The curve in frequency order (`Result.samples` is ordered)."""
    return [
        SamplePoint(
            frequency_hz=sample.frequency_hz,
            magnitude_mm=sample.magnitude_mm,
            assessed=sample.frequency_hz <= result.assess_max_hz,
        )
        for sample in result.samples
    ]
