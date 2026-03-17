"""
API Routers for RL Gym Visualizer.
"""
from app.routers.auth import router as auth_router
from app.routers.environments import router as environments_router
from app.routers.runs import router as runs_router

__all__ = ["auth_router", "environments_router", "runs_router"]
