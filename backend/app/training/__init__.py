"""
Training module for RL Gym Visualizer.

Provides in-process, interruptible training with Stable-Baselines3.
"""
from app.training.manager import TrainingManager, get_training_manager
from app.training.background_worker import BackgroundJobWorker, get_background_worker

__all__ = [
    "TrainingManager",
    "BackgroundJobWorker",
    "get_training_manager",
    "get_background_worker",
]
