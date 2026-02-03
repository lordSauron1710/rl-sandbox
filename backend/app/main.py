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
from app.training import get_training_manager


def _get_cors_origins() -> list[str]:
    """Read CORS origins from env, with safe local defaults."""
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup."""
    # Initialize database
    init_db()
    try:
        yield
    finally:
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
