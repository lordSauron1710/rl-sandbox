"""
Training manager for coordinating background training runs.

This module provides:
- Thread-safe management of training jobs
- Start/stop control for training runs
- Progress tracking and status updates
- Singleton pattern for global access
"""
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
import json

from app.db import runs_repository, events_repository
from app.models.run import RunStatus
from app.models.event import EventType
from app.training.runner import TrainingRunner


@dataclass
class TrainingJob:
    """Represents an active training job."""
    run_id: str
    thread: threading.Thread
    stop_event: threading.Event
    started_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    current_timestep: int = 0
    total_timesteps: int = 0


class TrainingManager:
    """
    Manages background training jobs.

    Thread-safe singleton that coordinates:
    - Starting training in background threads
    - Stopping training via stop events
    - Tracking active jobs and their progress

    Usage:
        manager = get_training_manager()
        manager.start_training(run_id)
        manager.stop_training(run_id)
    """

    _instance: Optional["TrainingManager"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "TrainingManager":
        """Singleton pattern."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize the manager (only once due to singleton)."""
        if self._initialized:
            return

        self._jobs: Dict[str, TrainingJob] = {}
        self._jobs_lock = threading.Lock()
        self._initialized = True

    def is_training(self, run_id: str) -> bool:
        """Check if a run is currently training."""
        with self._jobs_lock:
            job = self._jobs.get(run_id)
            return job is not None and job.thread.is_alive()

    def get_active_runs(self) -> list[str]:
        """Get list of currently training run IDs."""
        with self._jobs_lock:
            return [
                run_id for run_id, job in self._jobs.items()
                if job.thread.is_alive()
            ]

    def get_progress(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get progress for a training run."""
        with self._jobs_lock:
            job = self._jobs.get(run_id)
            if job is None:
                return None
            pct = 0.0
            if job.total_timesteps > 0:
                pct = job.current_timestep / job.total_timesteps * 100
            return {
                "current_timestep": job.current_timestep,
                "total_timesteps": job.total_timesteps,
                "percent_complete": pct,
                "is_running": job.thread.is_alive(),
                "started_at": job.started_at.isoformat(),
            }

    def start_training(self, run_id: str) -> Dict[str, Any]:
        """
        Start training for a run in a background thread.

        Args:
            run_id: The run ID to start training for

        Returns:
            Dict with success status and message

        Raises:
            ValueError: If run not found or invalid state
        """
        # Check if already training
        if self.is_training(run_id):
            return {
                "success": False,
                "error": "Training already in progress for this run",
            }

        # Get run from database
        run_dict = runs_repository.get_run(run_id)
        if not run_dict:
            return {
                "success": False,
                "error": "Run not found",
            }

        # Check status
        current_status = run_dict["status"]
        valid_statuses = [RunStatus.PENDING.value, RunStatus.STOPPED.value]
        if current_status not in valid_statuses:
            return {
                "success": False,
                "error": f"Cannot start training from status: {current_status}",
            }

        # Parse config
        config = json.loads(run_dict["config_json"])
        hyperparameters = config.get("hyperparameters", {})
        total_timesteps = hyperparameters.get("total_timesteps", 1000000)

        # Create stop event
        stop_event = threading.Event()

        # Create job
        job = TrainingJob(
            run_id=run_id,
            thread=threading.Thread(target=lambda: None),  # Placeholder
            stop_event=stop_event,
            total_timesteps=total_timesteps,
        )

        # Progress callback
        def on_progress(current: int, total: int):
            job.current_timestep = current
            job.total_timesteps = total

        # Training thread function
        def training_thread():
            try:
                # Update status to training
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=RunStatus.TRAINING,
                    started_at=datetime.now(timezone.utc),
                )

                # Log training started
                algo = config.get('algorithm', 'unknown')
                env = config.get('env_id', 'unknown')
                events_repository.create_event(
                    run_id=run_id,
                    event_type=EventType.TRAINING_STARTED,
                    message=f"Training started with {algo} on {env}",
                    metadata={"hyperparameters": hyperparameters},
                )

                # Create and run trainer
                runner = TrainingRunner(
                    run_id=run_id,
                    env_id=config.get("env_id"),
                    algorithm=config.get("algorithm"),
                    hyperparameters=hyperparameters,
                    seed=config.get("seed"),
                    stop_flag=stop_event.is_set,
                    on_progress=on_progress,
                    verbose=1,
                )

                result = runner.run()

                # Determine final status
                if result["success"]:
                    if result["stopped"]:
                        final_status = RunStatus.STOPPED
                        event_type = EventType.TRAINING_STOPPED
                        msg = (f"Training stopped by user after "
                               f"{result['episodes']} episodes")
                    else:
                        final_status = RunStatus.COMPLETED
                        event_type = EventType.TRAINING_COMPLETED
                        msg = (f"Training completed: {result['episodes']} "
                               f"episodes, mean reward: "
                               f"{result['mean_reward']:.2f}")
                else:
                    final_status = RunStatus.FAILED
                    event_type = EventType.TRAINING_FAILED
                    msg = f"Training failed: {result['error']}"

                # Update status
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=final_status,
                    completed_at=datetime.now(timezone.utc),
                )

                # Log completion event
                events_repository.create_event(
                    run_id=run_id,
                    event_type=event_type,
                    message=msg,
                    metadata=result,
                )

                # Save checkpoint event
                if result["success"]:
                    events_repository.create_event(
                        run_id=run_id,
                        event_type=EventType.CHECKPOINT_SAVED,
                        message="Final model checkpoint saved",
                    )

            except Exception as e:
                # Handle unexpected errors
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=RunStatus.FAILED,
                    completed_at=datetime.now(timezone.utc),
                )
                events_repository.create_event(
                    run_id=run_id,
                    event_type=EventType.ERROR,
                    message=f"Unexpected error: {str(e)}",
                )

            finally:
                # Cleanup job from active jobs
                with self._jobs_lock:
                    if run_id in self._jobs:
                        del self._jobs[run_id]

        # Create thread
        thread = threading.Thread(
            target=training_thread,
            name=f"training-{run_id[:8]}",
            daemon=True,
        )
        job.thread = thread

        # Register job
        with self._jobs_lock:
            self._jobs[run_id] = job

        # Start training
        thread.start()

        return {
            "success": True,
            "message": "Training started",
        }

    def stop_training(self, run_id: str) -> Dict[str, Any]:
        """
        Stop training for a run.

        Args:
            run_id: The run ID to stop

        Returns:
            Dict with success status and message
        """
        with self._jobs_lock:
            job = self._jobs.get(run_id)

        if job is None:
            # Check if run exists and is in training status
            run_dict = runs_repository.get_run(run_id)
            if not run_dict:
                return {
                    "success": False,
                    "error": "Run not found",
                }
            if run_dict["status"] != RunStatus.TRAINING.value:
                return {
                    "success": False,
                    "error": (f"Run is not currently training "
                              f"(status: {run_dict['status']})"),
                }
            # Job not in memory but status is training - might be stale
            runs_repository.update_run_status(
                run_id=run_id,
                status=RunStatus.STOPPED,
                completed_at=datetime.now(timezone.utc),
            )
            return {
                "success": True,
                "message": "Training marked as stopped (was not actively running)",
            }

        if not job.thread.is_alive():
            return {
                "success": False,
                "error": "Training thread is not active",
            }

        # Signal stop
        job.stop_event.set()

        # Log stop request
        events_repository.create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Stop requested by user",
        )

        return {
            "success": True,
            "message": "Stop signal sent, training will stop after current step",
        }

    def cleanup(self) -> None:
        """Stop all active training jobs."""
        with self._jobs_lock:
            for run_id, job in list(self._jobs.items()):
                if job.thread.is_alive():
                    job.stop_event.set()


# Global instance getter
def get_training_manager() -> TrainingManager:
    """Get the global training manager instance."""
    return TrainingManager()
