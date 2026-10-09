from fastapi import APIRouter

from app.api import components, health, imports, projects, results

router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(imports.router)
router.include_router(projects.router)
router.include_router(components.router)
router.include_router(results.router)
