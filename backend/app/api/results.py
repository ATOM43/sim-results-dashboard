from fastapi import APIRouter

from app.api.deps import SessionDep, or_404
from app.api.schemas import ResultDetail
from app.services.queries import results as queries

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/{result_id}", response_model=ResultDetail)
def get_result(result_id: int, session: SessionDep):
    return or_404(queries.get_result(session, result_id), "result", result_id)
