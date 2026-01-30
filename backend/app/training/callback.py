"""
Custom Stable-Baselines3 callback for metrics logging.

This callback is responsible for:
- Writing metrics to JSONL as training progresses
- Tracking episode rewards, lengths, loss, and FPS
- Supporting training interruption via stop flag
"""
import time
from datetime import datetime, timezone
from typing import Optional, Callable, Any, Dict
import numpy as np

from stable_baselines3.common.callbacks import BaseCallback

from app.storage.run_storage import RunStorage


class MetricsCallback(BaseCallback):
    """
    Custom callback for logging training metrics to JSONL.

    Tracks:
    - Episode rewards and lengths (from info dict)
    - Training loss (from model logger)
    - FPS (frames per second)
    - Current timestep and progress

    Metrics Format (JSONL lines):
    {
        "episode": int,
        "reward": float,
        "length": int,
        "loss": float | null,
        "fps": int,
        "timestep": int,
        "timestamp": str (ISO format)
    }
    """

    def __init__(
        self,
        run_id: str,
        total_timesteps: int,
        stop_flag: Callable[[], bool],
        on_progress: Optional[Callable[[int, int], None]] = None,
        log_interval: int = 1,  # Log every N episodes
        verbose: int = 0,
    ):
        """
        Initialize the metrics callback.

        Args:
            run_id: The run ID for storage
            total_timesteps: Total timesteps for training (for progress)
            stop_flag: Callable that returns True if training should stop
            on_progress: Optional callback for progress updates (current, total)
            log_interval: How often to log metrics (every N episodes)
            verbose: Verbosity level
        """
        super().__init__(verbose)
        self.run_id = run_id
        self.total_timesteps = total_timesteps
        self.stop_flag = stop_flag
        self.on_progress = on_progress
        self.log_interval = log_interval

        self.storage = RunStorage(run_id)

        # Episode tracking
        self.episode_count = 0
        self.episode_rewards: list[float] = []
        self.episode_lengths: list[int] = []

        # FPS tracking
        self.start_time: Optional[float] = None
        self.last_log_time: Optional[float] = None
        self.last_log_timestep: int = 0

        # Loss tracking (from model's logger)
        self.last_loss: Optional[float] = None

    def _init_callback(self) -> bool:
        """Initialize callback at training start."""
        self.start_time = time.time()
        self.last_log_time = self.start_time
        self.last_log_timestep = 0
        return True

    def _on_step(self) -> bool:
        """
        Called after each environment step.

        Returns:
            False to stop training, True to continue
        """
        # Check stop flag
        if self.stop_flag():
            if self.verbose > 0:
                print(f"[MetricsCallback] Stop requested at step {self.num_timesteps}")
            return False

        # Check for completed episodes in info
        # SB3 stores episode info in 'infos' for vectorized envs
        infos = self.locals.get("infos", [])
        for info in infos:
            if "episode" in info:
                # Episode completed
                ep_reward = info["episode"]["r"]
                ep_length = info["episode"]["l"]

                self.episode_count += 1
                self.episode_rewards.append(ep_reward)
                self.episode_lengths.append(ep_length)

                # Log metrics every log_interval episodes
                if self.episode_count % self.log_interval == 0:
                    self._log_metrics(ep_reward, ep_length)

        # Progress callback
        if self.on_progress:
            self.on_progress(self.num_timesteps, self.total_timesteps)

        return True

    def _log_metrics(self, reward: float, length: int) -> None:
        """Log metrics to JSONL file."""
        current_time = time.time()

        # Calculate FPS
        elapsed = current_time - (self.last_log_time or self.start_time or current_time)
        timesteps_elapsed = self.num_timesteps - self.last_log_timestep
        fps = int(timesteps_elapsed / elapsed) if elapsed > 0 else 0

        # Try to get loss from model's logger
        loss = self._get_loss_from_logger()

        # Build metric entry
        metric = {
            "episode": self.episode_count,
            "reward": float(reward),
            "length": int(length),
            "loss": loss,
            "fps": fps,
            "timestep": self.num_timesteps,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Append to JSONL
        self.storage.append_metric(metric)

        # Update tracking
        self.last_log_time = current_time
        self.last_log_timestep = self.num_timesteps

        if self.verbose > 0:
            print(f"[MetricsCallback] Episode {self.episode_count}: "
                  f"reward={reward:.2f}, length={length}, fps={fps}")

    def _get_loss_from_logger(self) -> Optional[float]:
        """Try to extract loss from the model's logger."""
        try:
            if hasattr(self.model, "logger") and self.model.logger is not None:
                # Check for different loss names depending on algorithm
                loss_names = [
                    "loss", "train/loss", "train/policy_loss",
                    "train/value_loss", "loss/policy_loss"
                ]
                for loss_name in loss_names:
                    if hasattr(self.model.logger, "name_to_value"):
                        value = self.model.logger.name_to_value.get(loss_name)
                        if value is not None:
                            return float(value)
        except Exception:
            pass
        return self.last_loss

    def _on_training_end(self) -> None:
        """Called at the end of training."""
        if self.verbose > 0:
            total_time = time.time() - (self.start_time or time.time())
            print(f"[MetricsCallback] Training ended. "
                  f"Episodes: {self.episode_count}, Time: {total_time:.1f}s")

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of training progress."""
        return {
            "episode_count": self.episode_count,
            "mean_reward": (
                float(np.mean(self.episode_rewards))
                if self.episode_rewards else 0.0
            ),
            "mean_length": (
                float(np.mean(self.episode_lengths))
                if self.episode_lengths else 0.0
            ),
            "total_timesteps": self.num_timesteps,
            "episodes": len(self.episode_rewards),
        }
