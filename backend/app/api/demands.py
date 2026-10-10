from fastapi import APIRouter, HTTPException

from app.api.deps import SessionDep, or_404
from app.api.schemas import DemandCreate, DemandDetail, DemandStatus, DemandUpdate
from app.services import demands as service
from app.services.queries import demands as queries

router = APIRouter(prefix="/demands", tags=["demands"])


@router.post("", response_model=DemandDetail, status_code=201)
def create_demand(body: DemandCreate, session: SessionDep):
    try:
        if body.origin_type == "manual" and body.component_id is not None:
            demand = or_404(
                service.create_manual(session, body.component_id, body.description),
                "component",
                body.component_id,
            )
        elif body.origin_type in (None, "finding") and body.origin_result_id is not None:
            demand = or_404(
                service.create_from_finding(session, body.origin_result_id, body.description),
                "result",
                body.origin_result_id,
            )
        else:
            raise HTTPException(
                400, "supply either origin_result_id, or origin_type 'manual' with component_id"
            )
    except service.DemandError as exc:
        raise HTTPException(400, str(exc)) from exc
    return queries.get_demand(session, demand.id)


@router.get("", response_model=list[DemandDetail])
def list_demands(
    session: SessionDep,
    status: DemandStatus | None = None,
    component_id: int | None = None,
    project_id: int | None = None,
):
    return queries.list_demands(session, status, component_id, project_id)


@router.get("/{demand_id}", response_model=DemandDetail)
def get_demand(demand_id: int, session: SessionDep):
    return or_404(queries.get_demand(session, demand_id), "demand", demand_id)


@router.patch("/{demand_id}", response_model=DemandDetail)
def update_demand(demand_id: int, body: DemandUpdate, session: SessionDep):
    if body.model_extra:
        raise HTTPException(
            400,
            f"cannot change {', '.join(sorted(body.model_extra))}: "
            "only description and status are editable",
        )
    try:
        demand = service.update_demand(session, demand_id, body.description, body.status)
    except service.DemandError as exc:
        raise HTTPException(400, str(exc)) from exc
    or_404(demand, "demand", demand_id)
    return queries.get_demand(session, demand_id)
