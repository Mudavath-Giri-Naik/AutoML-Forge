"""FastAPI entrypoint: app wiring, CORS, startup seeding."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import datasets
from app.services.dataset_service import ensure_demo_datasets_seeded


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_demo_datasets_seeded()
    yield


app = FastAPI(title="AutoML Forge API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
