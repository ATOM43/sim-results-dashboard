from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Component, Project, Result, Revision

# Helpers flush but never commit: the caller owns the transaction.


def get_or_create_project(session: Session, name: str) -> Project:
    project = session.scalar(select(Project).where(Project.name == name))
    if project is None:
        project = Project(name=name)
        session.add(project)
        session.flush()
    return project


def get_or_create_component(session: Session, project_id: int, name: str) -> Component:
    component = session.scalar(
        select(Component).where(Component.project_id == project_id, Component.name == name)
    )
    if component is None:
        component = Component(project_id=project_id, name=name)
        session.add(component)
        session.flush()
    return component


def get_or_create_revision(
    session: Session, project_id: int, label: str, sort_key: int
) -> Revision:
    revision = session.scalar(
        select(Revision).where(Revision.project_id == project_id, Revision.label == label)
    )
    if revision is None:
        revision = Revision(project_id=project_id, label=label, sort_key=sort_key)
        session.add(revision)
        session.flush()
    return revision


def get_result(session: Session, component_id: int, revision_id: int) -> Result | None:
    return session.scalar(
        select(Result).where(Result.component_id == component_id, Result.revision_id == revision_id)
    )
