"""
RL Gym Visualizer - FastAPI Backend
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routers import environments_router, runs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup."""
    # Initialize database
    init_db()
    yield


app = FastAPI(
    title="RL Gym Visualizer",
    description="Backend API for RL training visualization",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers with /api/v1 prefix
app.include_router(environments_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api/v1")


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
