"""
Environment registry for RL Gym Visualizer.
"""
from pydantic import BaseModel
from typing import List


class Environment(BaseModel):
    """Environment metadata."""
    id: str
    name: str
    display_id: str
    action_space_type: str  # "Discrete" or "Continuous"
    action_space_size: int
    obs_space_type: str  # "Box"
    obs_space_dims: int
    description: str
    supported_algorithms: List[str]


# Hardcoded environment registry for v0
# Note: Using v3 versions for LunarLander and BipedalWalker (v2 deprecated in Gymnasium 1.0+)
ENVIRONMENTS: List[Environment] = [
    Environment(
        id="LunarLander-v3",
        name="LunarLander-v3",
        display_id="ID:01",
        action_space_type="Discrete",
        action_space_size=4,
        obs_space_type="Box",
        obs_space_dims=8,
        description="Land a spacecraft on the moon",
        supported_algorithms=["PPO", "DQN"],
    ),
    Environment(
        id="CartPole-v1",
        name="CartPole-v1",
        display_id="ID:02",
        action_space_type="Discrete",
        action_space_size=2,
        obs_space_type="Box",
        obs_space_dims=4,
        description="Balance a pole on a cart",
        supported_algorithms=["PPO", "DQN"],
    ),
    Environment(
        id="BipedalWalker-v3",
        name="BipedalWalker-v3",
        display_id="ID:03",
        action_space_type="Continuous",
        action_space_size=4,
        obs_space_type="Box",
        obs_space_dims=24,
        description="Teach a robot to walk",
        supported_algorithms=["PPO"],  # DQN doesn't support continuous actions
    ),
]


def get_environment(env_id: str) -> Environment | None:
    """Get environment by ID."""
    for env in ENVIRONMENTS:
        if env.id == env_id:
            return env
    return None


def get_all_environments() -> List[Environment]:
    """Get all available environments."""
    return ENVIRONMENTS
