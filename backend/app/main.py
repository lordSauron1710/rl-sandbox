"""
RL Gym Visualizer - FastAPI Backend
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routers import environments_router, runs_router
from app.streaming import streaming_router
from app.training import get_background_worker, get_training_manager


def _get_cors_origins() -> list[str]:
    """
    Read CORS origins from env, with safe local defaults.

    Supports:
      - CORS_ORIGINS="https://app.example.com,https://preview.example.com"
      - FRONTEND_URL="https://app.example.com" (appended if not present)
    """
    default_origins = "http://localhost:3000,http://127.0.0.1:3000"
    raw = os.getenv("CORS_ORIGINS", default_origins)

    origins: list[str] = []
    seen: set[str] = set()

    for value in raw.split(","):
        origin = value.strip().rstrip("/")
        if not origin or origin in seen:
            continue
        origins.append(origin)
        seen.add(origin)

    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_url and frontend_url not in seen:
        origins.append(frontend_url)

    return origins or default_origins.split(",")


def _get_cors_origin_regex() -> str | None:
    """
    Optional regex for dynamic origins (e.g. Vercel preview URLs).

    Example:
      CORS_ORIGIN_REGEX="https://.*\\.vercel\\.app"
    """
    raw = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    return raw or None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup."""
    # Initialize database
    init_db()
    get_background_worker().start()
    try:
        yield
    finally:
        get_background_worker().stop()
        # Stop any background workers on shutdown.
        get_training_manager().cleanup()


app = FastAPI(
    title="RL Gym Visualizer",
    description="Backend API for RL training visualization",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_origin_regex=_get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers with /api/v1 prefix
app.include_router(environments_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api/v1")
app.include_router(streaming_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "RL Gym Visualizer API",
        "version": "0.1.0",
        "docs": "/docs",
        "api_base": "/api/v1",
    }
