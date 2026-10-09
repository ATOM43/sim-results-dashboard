from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import config
from app.api.schemas import ImportStatus
from app.db.base import get_session
from app.services.ingestion import ImportReport, sync_folder
from app.services.queries import imports as queries

router = APIRouter(tags=["import"])


@router.post("/import")
def run_import(session: Annotated[Session, Depends(get_session)]) -> ImportReport:
    if not config.INPUTS_DIR.is_dir():
        raise HTTPException(503, f"inputs folder not found: {config.INPUTS_DIR}")
    return sync_folder(session, config.INPUTS_DIR)


@router.get("/import/status", response_model=ImportStatus)
def import_status(session: Annotated[Session, Depends(get_session)]):
    return queries.import_status(session)
