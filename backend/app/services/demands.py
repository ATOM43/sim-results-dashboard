from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Component, Demand, Result, Revision


class DemandError(ValueError):
    """The request breaks a demand rule."""


def create_from_finding(session: Session, origin_result_id: int, description: str) -> Demand | None:
    """Raise a demand from a FAIL result, freezing a copy of the finding. None if unknown."""
    result = session.get(Result, origin_result_id)
    if result is None:
        return None
    if result.verdict != "FAIL":
        raise DemandError("cannot raise a demand from a passing result")
    demand = Demand(
        component_id=result.component_id,
        description=description,
        origin_type="finding",
        origin_result_id=result.id,
        origin_revision_label=result.revision.label,
        origin_metric="peak_magnitude",
        origin_value_mm=result.peak_magnitude_mm,
        origin_frequency_hz=result.peak_frequency_hz,
        origin_limit_mm=result.limit_mm,
        origin_assess_max_hz=result.assess_max_hz,
    )
    session.add(demand)
    session.commit()
    return demand


def create_manual(session: Session, component_id: int, description: str) -> Demand | None:
    """A demand with no origin finding. None if the component is unknown."""
    if session.get(Component, component_id) is None:
        return None
    demand = Demand(component_id=component_id, description=description, origin_type="manual")
    session.add(demand)
    session.commit()
    return demand


def update_demand(
    session: Session, demand_id: int, description: str | None = None, status: str | None = None
) -> Demand | None:
    """Set the description and/or status; None leaves a field alone. None if unknown."""
    demand = session.get(Demand, demand_id)
    if demand is None:
        return None
    if description is not None:
        demand.description = description
    if status is not None:
        demand.status = status
    session.commit()
    return demand


def seed_demands(
    session: Session, revision_label: str = "rev1"
) -> tuple[list[Demand], list[Demand]]:
    """One demand per component from its FAIL result in the given revision.

    Returns (created, skipped); a result that already has a finding demand is skipped.
    """
    results = session.scalars(
        select(Result)
        .join(Result.revision)
        .where(Revision.label == revision_label, Result.verdict == "FAIL")
        .order_by(Result.component_id)
    ).all()
    created: list[Demand] = []
    skipped: list[Demand] = []
    for result in results:
        existing = session.scalars(
            select(Demand)
            .where(Demand.origin_type == "finding", Demand.origin_result_id == result.id)
            .limit(1)
        ).first()
        if existing is not None:
            skipped.append(existing)
            continue
        demand = create_from_finding(
            session,
            result.id,
            f"{result.component.name}: peak {result.peak_magnitude_mm:g} mm at "
            f"{result.peak_frequency_hz:g} Hz exceeds the {result.limit_mm:g} mm limit "
            f"in {revision_label}",
        )
        assert demand is not None
        created.append(demand)
    return created, skipped
