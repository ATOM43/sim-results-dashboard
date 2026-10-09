from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.base import get_session

SessionDep = Annotated[Session, Depends(get_session)]


def or_404[T](value: T | None, thing: str, thing_id: int) -> T:
    if value is None:
        raise HTTPException(404, f"{thing} {thing_id} not found")
    return value
