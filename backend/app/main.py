from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api import router

app = FastAPI(title="Simulation Results Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
