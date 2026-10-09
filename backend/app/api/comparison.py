from fastapi import APIRouter, HTTPException

from app.api.deps import SessionDep, or_404
from app.api.schemas import Comparison, Matrix
from app.services.queries import comparison as queries

router = APIRouter(tags=["comparison"])


@router.get("/components/{component_id}/comparison", response_model=Comparison)
def get_comparison(
    component_id: int,
    session: SessionDep,
    revisions: str | None = None,
    baseline: str | None = None,
):
    labels = [label.strip() for label in (revisions or "").split(",") if label.strip()]
    try:
        comparison = queries.get_comparison(session, component_id, labels or None, baseline)
    except queries.RevisionNotFoundError as exc:
        raise HTTPException(
            400, f"revision {exc.label} not found for component {component_id}"
        ) from exc
    return or_404(comparison, "component", component_id)


@router.get("/projects/{project_id}/matrix", response_model=Matrix)
def get_matrix(project_id: int, session: SessionDep):
    return or_404(queries.get_matrix(session, project_id), "project", project_id)
