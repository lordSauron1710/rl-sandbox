"""
Reward saturation heuristics for automatic early stopping.

This module provides environment-aware defaults that stop training once
performance appears to have hit a ceiling or a stable plateau at a high score.
"""
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np


@dataclass(frozen=True)
class RewardSaturationConfig:
    """Configuration for detecting reward saturation."""
    min_episodes: int
    window_size: int
    comparison_window_size: int
    max_recent_std: float
    min_improvement: float
    min_reward_for_plateau: float
    target_reward: Optional[float] = None
    target_tolerance: float = 0.0


# Tuned for currently supported Gymnasium environments.
ENV_SATURATION_CONFIGS: dict[str, RewardSaturationConfig] = {
    "CartPole-v1": RewardSaturationConfig(
        min_episodes=80,
        window_size=30,
        comparison_window_size=30,
        max_recent_std=3.0,
        min_improvement=1.0,
        min_reward_for_plateau=470.0,
        target_reward=500.0,
        target_tolerance=2.0,
    ),
    "LunarLander-v3": RewardSaturationConfig(
        min_episodes=120,
        window_size=40,
        comparison_window_size=40,
        max_recent_std=35.0,
        min_improvement=2.5,
        min_reward_for_plateau=210.0,
        target_reward=250.0,
        target_tolerance=20.0,
    ),
    "BipedalWalker-v3": RewardSaturationConfig(
        min_episodes=160,
        window_size=50,
        comparison_window_size=50,
        max_recent_std=45.0,
        min_improvement=3.0,
        min_reward_for_plateau=260.0,
        target_reward=300.0,
        target_tolerance=20.0,
    ),
}


DEFAULT_SATURATION_CONFIG = RewardSaturationConfig(
    min_episodes=120,
    window_size=40,
    comparison_window_size=40,
    max_recent_std=30.0,
    min_improvement=2.0,
    min_reward_for_plateau=200.0,
)


def get_reward_saturation_config(env_id: str) -> RewardSaturationConfig:
    """Return reward saturation config for an environment."""
    return ENV_SATURATION_CONFIGS.get(env_id, DEFAULT_SATURATION_CONFIG)


def detect_reward_saturation(
    rewards: Sequence[float],
    config: RewardSaturationConfig,
    episode: int,
    timestep: int,
) -> Optional[dict]:
    """
    Detect whether reward progression has saturated.

    Returns a metadata dict when saturation is detected, else None.
    """
    if len(rewards) < config.min_episodes:
        return None
    if len(rewards) < config.window_size:
        return None

    recent = np.asarray(rewards[-config.window_size :], dtype=np.float64)
    recent_mean = float(np.mean(recent))
    recent_std = float(np.std(recent))

    target_reward = config.target_reward
    if (
        target_reward is not None
        and recent_mean >= (target_reward - config.target_tolerance)
        and recent_std <= config.max_recent_std
    ):
        return {
            "triggered": True,
            "reason": "reward_ceiling",
            "episode": int(episode),
            "timestep": int(timestep),
            "recent_window": int(config.window_size),
            "recent_mean_reward": recent_mean,
            "recent_std_reward": recent_std,
            "target_reward": float(target_reward),
            "target_tolerance": float(config.target_tolerance),
        }

    if recent_mean < config.min_reward_for_plateau:
        return None

    required = config.window_size + config.comparison_window_size
    if len(rewards) < required:
        return None

    previous = np.asarray(
        rewards[-required : -config.window_size],
        dtype=np.float64,
    )
    previous_mean = float(np.mean(previous))
    improvement = recent_mean - previous_mean

    if improvement <= config.min_improvement and recent_std <= config.max_recent_std:
        return {
            "triggered": True,
            "reason": "reward_plateau",
            "episode": int(episode),
            "timestep": int(timestep),
            "recent_window": int(config.window_size),
            "comparison_window": int(config.comparison_window_size),
            "recent_mean_reward": recent_mean,
            "previous_mean_reward": previous_mean,
            "recent_std_reward": recent_std,
            "improvement": improvement,
            "min_improvement": float(config.min_improvement),
            "min_reward_for_plateau": float(config.min_reward_for_plateau),
        }

    return None
