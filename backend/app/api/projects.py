from fastapi import APIRouter

from app.api.deps import SessionDep, or_404
from app.api.schemas import ComponentSummary, ProjectSummary, RevisionSummary
from app.services.queries import projects as queries

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSummary])
def list_projects(session: SessionDep):
    return queries.list_projects(session)


@router.get("/{project_id}/components", response_model=list[ComponentSummary])
def list_components(project_id: int, session: SessionDep):
    return or_404(queries.list_components(session, project_id), "project", project_id)


@router.get("/{project_id}/revisions", response_model=list[RevisionSummary])
def list_revisions(project_id: int, session: SessionDep):
    return or_404(queries.list_revisions(session, project_id), "project", project_id)
