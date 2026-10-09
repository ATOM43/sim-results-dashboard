from fastapi import APIRouter

from app.api import health

router = APIRouter(prefix="/api")
router.include_router(health.router)
