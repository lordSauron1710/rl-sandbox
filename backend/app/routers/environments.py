"""
Environment endpoints for RL Gym Visualizer.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

from app.models.environment import Environment, get_all_environments

router = APIRouter(prefix="/environments", tags=["environments"])


class EnvironmentsResponse(BaseModel):
    """Response schema for list environments."""
    environments: List[Environment]


@router.get("", response_model=EnvironmentsResponse)
async def list_environments() -> EnvironmentsResponse:
    """
    List all supported environments.
    
    Returns metadata for each environment including:
    - Environment ID and display name
    - Action space type (Discrete/Continuous) and size
    - Observation space type and dimensions
    - Supported algorithms
    """
    environments = get_all_environments()
    return EnvironmentsResponse(environments=environments)
