"""
RL Gym Visualizer - FastAPI Backend
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.db.database import init_db
from app.routers import environments_router, runs_router
from app.security import (
    get_cors_origin_regex,
    get_cors_origins,
    get_trusted_hosts,
    should_expose_api_docs,
)
from app.streaming import streaming_router
from app.training import get_background_worker, get_training_manager

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


api_docs_enabled = should_expose_api_docs()
app = FastAPI(
    title="RL Gym Visualizer",
    description="Backend API for RL training visualization",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if api_docs_enabled else None,
    redoc_url="/redoc" if api_docs_enabled else None,
    openapi_url="/openapi.json" if api_docs_enabled else None,
)

trusted_hosts = get_trusted_hosts()
if trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Attach baseline security headers to backend responses."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


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
        "docs": "/docs" if api_docs_enabled else None,
        "api_base": "/api/v1",
    }
