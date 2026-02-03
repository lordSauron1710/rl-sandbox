"""
Preset and bounds configuration for training hyperparameters.
"""
from copy import deepcopy
from typing import Any, Dict


# Hyperparameter bounds used for server-side validation.
HYPERPARAMETER_BOUNDS: Dict[str, Dict[str, float | int]] = {
    "learning_rate": {"min": 1e-6, "max": 1.0},
    "total_timesteps": {"min": 5_000, "max": 5_000_000},
    "batch_size": {"min": 16, "max": 1_024},
    "n_steps": {"min": 64, "max": 8_192},
    "gamma": {"min": 0.8, "max": 0.9999},
    "buffer_size": {"min": 512, "max": 2_000_000},
    "exploration_fraction": {"min": 0.0, "max": 1.0},
    "exploration_final_eps": {"min": 0.0, "max": 0.5},
}


ALGORITHM_HYPERPARAMETER_FIELDS: Dict[str, list[str]] = {
    "PPO": [
        "learning_rate",
        "total_timesteps",
        "batch_size",
        "n_steps",
        "gamma",
    ],
    "DQN": [
        "learning_rate",
        "total_timesteps",
        "batch_size",
        "buffer_size",
        "gamma",
        "exploration_fraction",
        "exploration_final_eps",
    ],
}


ALGORITHM_DEFAULT_PRESET: Dict[str, str] = {
    "PPO": "stable",
    "DQN": "stable",
}


PRESET_TABLES: Dict[str, Dict[str, Dict[str, Any]]] = {
    "PPO": {
        "fast": {
            "label": "Fast",
            "description": "Shorter training budget for quick iteration loops.",
            "hyperparameters": {
                "learning_rate": 0.0004,
                "total_timesteps": 200_000,
                "batch_size": 64,
                "n_steps": 1_024,
                "gamma": 0.98,
            },
        },
        "stable": {
            "label": "Stable",
            "description": "Balanced default with reliable convergence behavior.",
            "hyperparameters": {
                "learning_rate": 0.0003,
                "total_timesteps": 1_000_000,
                "batch_size": 64,
                "n_steps": 2_048,
                "gamma": 0.99,
            },
        },
        "high_score": {
            "label": "High Score",
            "description": "Longer training for stronger peak policy performance.",
            "hyperparameters": {
                "learning_rate": 0.0001,
                "total_timesteps": 3_000_000,
                "batch_size": 256,
                "n_steps": 4_096,
                "gamma": 0.995,
            },
        },
    },
    "DQN": {
        "fast": {
            "label": "Fast",
            "description": "Quick baseline policy with smaller replay buffer.",
            "hyperparameters": {
                "learning_rate": 0.0005,
                "total_timesteps": 200_000,
                "batch_size": 64,
                "buffer_size": 50_000,
                "gamma": 0.98,
                "exploration_fraction": 0.2,
                "exploration_final_eps": 0.05,
            },
        },
        "stable": {
            "label": "Stable",
            "description": "Balanced replay and exploration defaults for consistency.",
            "hyperparameters": {
                "learning_rate": 0.0003,
                "total_timesteps": 1_000_000,
                "batch_size": 64,
                "buffer_size": 100_000,
                "gamma": 0.99,
                "exploration_fraction": 0.1,
                "exploration_final_eps": 0.02,
            },
        },
        "high_score": {
            "label": "High Score",
            "description": "Larger buffer and longer horizon tuned for top scores.",
            "hyperparameters": {
                "learning_rate": 0.0001,
                "total_timesteps": 3_000_000,
                "batch_size": 128,
                "buffer_size": 300_000,
                "gamma": 0.995,
                "exploration_fraction": 0.05,
                "exploration_final_eps": 0.01,
            },
        },
    },
}


def get_algorithm_presets(algorithm: str) -> Dict[str, Dict[str, Any]]:
    """Return preset mapping for an algorithm."""
    return deepcopy(PRESET_TABLES.get(algorithm, {}))


def get_preset_hyperparameters(algorithm: str, preset: str) -> Dict[str, Any]:
    """Return hyperparameters for the given algorithm + preset."""
    algorithm_presets = PRESET_TABLES.get(algorithm)
    if not algorithm_presets:
        raise ValueError(f"Unsupported algorithm: {algorithm}")
    preset_data = algorithm_presets.get(preset)
    if not preset_data:
        raise ValueError(f"Unknown preset '{preset}' for algorithm '{algorithm}'")
    return deepcopy(preset_data["hyperparameters"])


def build_hyperparameters(
    algorithm: str,
    preset: str | None,
    overrides: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Merge preset defaults with explicit request overrides.
    """
    selected_preset = preset or ALGORITHM_DEFAULT_PRESET.get(algorithm)
    if not selected_preset:
        raise ValueError(f"No default preset configured for '{algorithm}'")

    merged = get_preset_hyperparameters(algorithm, selected_preset)
    if overrides:
        merged.update(overrides)
    return merged


def get_bounds_for_algorithm(algorithm: str) -> Dict[str, Dict[str, float | int]]:
    """Return bounds limited to the fields used by the algorithm."""
    allowed_fields = ALGORITHM_HYPERPARAMETER_FIELDS.get(algorithm, [])
    return {
        field: deepcopy(HYPERPARAMETER_BOUNDS[field])
        for field in allowed_fields
        if field in HYPERPARAMETER_BOUNDS
    }


def filter_hyperparameters_for_algorithm(algorithm: str, hyperparameters: Dict[str, Any]) -> Dict[str, Any]:
    """Return only algorithm-relevant hyperparameters."""
    allowed = set(ALGORITHM_HYPERPARAMETER_FIELDS.get(algorithm, []))
    return {key: value for key, value in hyperparameters.items() if key in allowed}
