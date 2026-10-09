from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import config
from app.db.base import get_session
from app.services.ingestion import ImportReport, sync_folder

router = APIRouter(tags=["import"])


@router.post("/import")
def run_import(session: Annotated[Session, Depends(get_session)]) -> ImportReport:
    if not config.INPUTS_DIR.is_dir():
        raise HTTPException(503, f"inputs folder not found: {config.INPUTS_DIR}")
    return sync_folder(session, config.INPUTS_DIR)
