"""
Training module for RL Gym Visualizer.

Provides in-process, interruptible training with Stable-Baselines3.
"""
from app.training.manager import TrainingManager, get_training_manager

__all__ = ["TrainingManager", "get_training_manager"]
