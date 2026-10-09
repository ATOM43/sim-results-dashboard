from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager

from app.db.models import Component, Project, Result, Revision
from app.services.queries.types import (
    ComponentSummary,
    LatestResult,
    ProjectSummary,
    RevisionSummary,
)


def list_projects(session: Session) -> list[ProjectSummary]:
    def count_of(model: type[Component] | type[Revision]):
        return (
            select(func.count())
            .select_from(model)
            .where(model.project_id == Project.id)
            .scalar_subquery()
        )

    rows = session.execute(
        select(
            Project.id,
            Project.name,
            count_of(Component).label("component_count"),
            count_of(Revision).label("revision_count"),
        ).order_by(Project.name)
    )
    return [ProjectSummary(*row) for row in rows]


def list_components(session: Session, project_id: int) -> list[ComponentSummary] | None:
    """Each component with its result in the highest `sort_key` revision that has one."""
    if session.get(Project, project_id) is None:
        return None
    latest: dict[int, Result] = {}
    # Ascending sort_key, so the last result seen per component is the latest.
    for result in session.scalars(
        select(Result)
        .join(Result.revision)
        .where(Revision.project_id == project_id)
        .order_by(Revision.sort_key)
        .options(contains_eager(Result.revision))
    ):
        latest[result.component_id] = result

    components = session.scalars(
        select(Component).where(Component.project_id == project_id).order_by(Component.name)
    )
    return [
        ComponentSummary(
            id=component.id,
            name=component.name,
            latest=None if (result := latest.get(component.id)) is None else _latest(result),
        )
        for component in components
    ]


def _latest(result: Result) -> LatestResult:
    return LatestResult(
        result_id=result.id,
        revision_label=result.revision.label,
        peak_magnitude_mm=result.peak_magnitude_mm,
        peak_frequency_hz=result.peak_frequency_hz,
        verdict=result.verdict,
    )


def list_revisions(session: Session, project_id: int) -> list[RevisionSummary] | None:
    if session.get(Project, project_id) is None:
        return None
    rows = session.execute(
        select(
            Revision.id,
            Revision.label,
            Revision.sort_key,
            func.count(Result.id).label("result_count"),
            func.count(Result.id).filter(Result.verdict == "PASS").label("pass_count"),
            func.count(Result.id).filter(Result.verdict == "FAIL").label("fail_count"),
        )
        .outerjoin(Result, Result.revision_id == Revision.id)
        .where(Revision.project_id == project_id)
        .group_by(Revision.id)
        .order_by(Revision.sort_key)
    )
    return [RevisionSummary(*row) for row in rows]
