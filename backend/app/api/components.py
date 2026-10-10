from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import config
from app.api.deps import SessionDep, or_404
from app.api.schemas import ComponentRevision
from app.db.models import Component
from app.services.queries import components as queries

router = APIRouter(prefix="/components", tags=["components"])


@router.get("/{component_id}/revisions", response_model=list[ComponentRevision])
def list_revisions(component_id: int, session: SessionDep):
    return or_404(queries.list_revisions(session, component_id), "component", component_id)


@router.get("/{component_id}/image", response_class=FileResponse)
def get_image(component_id: int, session: SessionDep):
    """`Inputs/<ComponentName>.png`, if the folder has one."""
    component = or_404(session.get(Component, component_id), "component", component_id)
    inputs_dir = config.INPUTS_DIR.resolve()
    path = (inputs_dir / f"{component.name}.png").resolve()
    # The name comes from the database, never the request; still refuse anything outside the folder.
    if path.parent != inputs_dir or not path.is_file():
        raise HTTPException(404, f"no image for component {component_id}")
    return FileResponse(path, media_type="image/png")
