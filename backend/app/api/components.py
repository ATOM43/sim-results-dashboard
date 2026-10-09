from fastapi import APIRouter

from app.api.deps import SessionDep, or_404
from app.api.schemas import ComponentRevision
from app.services.queries import components as queries

router = APIRouter(prefix="/components", tags=["components"])


@router.get("/{component_id}/revisions", response_model=list[ComponentRevision])
def list_revisions(component_id: int, session: SessionDep):
    return or_404(queries.list_revisions(session, component_id), "component", component_id)
