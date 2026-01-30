"""
Environment endpoints for RL Gym Visualizer.
"""
import io
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List

import gymnasium as gym
from PIL import Image

from app.models.environment import (
    Environment, get_all_environments, get_environment
)

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


@router.get("/{env_id}/preview")
async def get_environment_preview(env_id: str) -> Response:
    """
    Get a preview frame of the environment's initial state.

    Returns a JPEG image of the environment render.
    This is useful for showing users what the environment looks like
    before training starts.

    Args:
        env_id: The environment ID (e.g., "LunarLander-v2")

    Returns:
        JPEG image of the environment's initial state
    """
    # Validate environment exists
    env_metadata = get_environment(env_id)
    if not env_metadata:
        error_detail = {
            "error": {
                "code": "not_found",
                "message": f"Environment '{env_id}' not found"
            }
        }
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail
        )

    try:
        # Create the environment with rgb_array render mode
        env = gym.make(env_id, render_mode="rgb_array")

        # Reset to get initial state and render
        env.reset()
        frame = env.render()

        # Close the environment
        env.close()

        # Convert numpy array to PIL Image
        image = Image.fromarray(frame)

        # Encode as JPEG
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=3600",
            }
        )

    except Exception as e:
        error_detail = {
            "error": {
                "code": "render_error",
                "message": f"Failed to render environment: {str(e)}"
            }
        }
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_detail
        )
