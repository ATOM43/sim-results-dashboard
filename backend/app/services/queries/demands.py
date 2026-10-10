from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Component, Demand, Result
from app.services.queries.types import DemandDetail, DemandHistoryEntry, NamedRef


def list_demands(
    session: Session,
    status: str | None = None,
    component_id: int | None = None,
    project_id: int | None = None,
) -> list[DemandDetail]:
    """Demands, newest first; the filters combine."""
    query = select(Demand).join(Demand.component)
    if status is not None:
        query = query.where(Demand.status == status)
    if component_id is not None:
        query = query.where(Demand.component_id == component_id)
    if project_id is not None:
        query = query.where(Component.project_id == project_id)
    return _details(session, query)


def get_demand(session: Session, demand_id: int) -> DemandDetail | None:
    details = _details(session, select(Demand).where(Demand.id == demand_id))
    return details[0] if details else None


def _details(session: Session, query) -> list[DemandDetail]:
    demands = session.scalars(
        query.options(joinedload(Demand.component).joinedload(Component.project)).order_by(
            Demand.created_at.desc(), Demand.id.desc()
        )
    ).all()
    results = {
        (result.component_id, result.revision_id): result
        for result in session.scalars(
            select(Result).where(Result.component_id.in_({d.component_id for d in demands}))
        )
    }
    return [_detail(demand, results) for demand in demands]


def _detail(demand: Demand, results: dict[tuple[int, int], Result]) -> DemandDetail:
    component = demand.component
    project = component.project
    revisions = project.revisions  # ordered by sort_key
    # History is derived on every read, so a newly imported revision joins it for free.
    # A manual demand has no origin revision and starts at the earliest one.
    start = next(
        (r.sort_key for r in revisions if r.label == demand.origin_revision_label),
        None,
    )
    history: list[DemandHistoryEntry] = []
    for revision in revisions:
        if start is not None and revision.sort_key < start:
            continue
        result = results.get((component.id, revision.id))
        history.append(
            DemandHistoryEntry(
                revision_id=revision.id,
                revision_label=revision.label,
                result_id=None if result is None else result.id,
                peak_magnitude_mm=None if result is None else result.peak_magnitude_mm,
                verdict=None if result is None else result.verdict,
            )
        )
    latest = next((entry for entry in reversed(history) if entry.result_id is not None), None)
    return DemandDetail(
        id=demand.id,
        description=demand.description,
        status=demand.status,
        component=NamedRef(id=component.id, name=component.name),
        project=NamedRef(id=project.id, name=project.name),
        origin_type=demand.origin_type,
        origin_revision_label=demand.origin_revision_label,
        origin_metric=demand.origin_metric,
        origin_value_mm=demand.origin_value_mm,
        origin_frequency_hz=demand.origin_frequency_hz,
        origin_limit_mm=demand.origin_limit_mm,
        origin_assess_max_hz=demand.origin_assess_max_hz,
        history=history,
        latest_result=latest,
        # Only a flag: nothing ever changes a demand's status automatically.
        latest_passes_but_open=(
            latest is not None and latest.verdict == "PASS" and demand.status != "Resolved"
        ),
    )
