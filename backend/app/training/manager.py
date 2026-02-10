"""
Training manager for coordinating background training and evaluation runs.

This module provides:
- Thread-safe management of training and evaluation jobs
- Start/stop control for training and evaluation runs
- Progress tracking and status updates
- Singleton pattern for global access
"""
import threading
from copy import deepcopy
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
import json

from app.db import runs_repository, events_repository
from app.models.run import RunStatus
from app.models.event import EventType
from app.training.runner import TrainingRunner
from app.training.evaluator import EvaluationRunner, EvaluationSummary


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


@dataclass
class EvaluationJob:
    """Represents an active evaluation job."""
    run_id: str
    thread: threading.Thread
    stop_event: threading.Event
    started_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    current_episode: int = 0
    total_episodes: int = 0


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
        self._eval_jobs: Dict[str, EvaluationJob] = {}
        self._training_outcomes: Dict[str, Dict[str, Any]] = {}
        self._evaluation_outcomes: Dict[str, Dict[str, Any]] = {}
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

    def get_last_training_outcome(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get final training outcome metadata for a run."""
        with self._jobs_lock:
            outcome = self._training_outcomes.get(run_id)
            return deepcopy(outcome) if outcome else None

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
            training_result: Optional[Dict[str, Any]] = None
            final_status = RunStatus.FAILED
            unexpected_error: Optional[str] = None
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

                training_result = runner.run()

                # Determine final status
                early_stopping = training_result.get("early_stopping")
                if training_result["success"]:
                    if training_result["stopped"]:
                        final_status = RunStatus.STOPPED
                        event_type = EventType.TRAINING_STOPPED
                        msg = (f"Training stopped by user after "
                               f"{training_result['episodes']} episodes")
                    elif early_stopping:
                        final_status = RunStatus.COMPLETED
                        event_type = EventType.TRAINING_COMPLETED
                        stop_reason = early_stopping.get("reason", "reward_saturation")
                        msg = (
                            "Training completed early due to "
                            f"{stop_reason} at episode "
                            f"{early_stopping.get('episode', training_result['episodes'])} "
                            f"(mean reward: "
                            f"{early_stopping.get('recent_mean_reward', training_result['mean_reward']):.2f})"
                        )
                    else:
                        final_status = RunStatus.COMPLETED
                        event_type = EventType.TRAINING_COMPLETED
                        msg = (f"Training completed: {training_result['episodes']} "
                               f"episodes, mean reward: "
                               f"{training_result['mean_reward']:.2f}")
                else:
                    final_status = RunStatus.FAILED
                    event_type = EventType.TRAINING_FAILED
                    msg = f"Training failed: {training_result['error']}"

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
                    metadata=training_result,
                )

                # Save checkpoint event
                if training_result["success"]:
                    events_repository.create_event(
                        run_id=run_id,
                        event_type=EventType.CHECKPOINT_SAVED,
                        message="Final model checkpoint saved",
                    )

            except Exception as e:
                # Handle unexpected errors
                unexpected_error = str(e)
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
                completed_at = datetime.now(timezone.utc).isoformat()
                error_message = unexpected_error
                if not error_message and training_result and not training_result.get("success"):
                    error_message = training_result.get("error")
                with self._jobs_lock:
                    self._training_outcomes[run_id] = {
                        "success": bool(training_result.get("success")) if training_result else False,
                        "final_status": final_status.value,
                        "result": training_result,
                        "error": error_message,
                        "completed_at": completed_at,
                    }
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
            self._training_outcomes.pop(run_id, None)

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

    # ========================================================================
    # Evaluation Management
    # ========================================================================

    def is_evaluating(self, run_id: str) -> bool:
        """Check if a run is currently being evaluated."""
        with self._jobs_lock:
            job = self._eval_jobs.get(run_id)
            return job is not None and job.thread.is_alive()

    def get_evaluation_progress(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get progress for an evaluation run."""
        with self._jobs_lock:
            job = self._eval_jobs.get(run_id)
            if job is None:
                return None
            pct = 0.0
            if job.total_episodes > 0:
                pct = job.current_episode / job.total_episodes * 100
            return {
                "current_episode": job.current_episode,
                "total_episodes": job.total_episodes,
                "percent_complete": pct,
                "is_running": job.thread.is_alive(),
                "started_at": job.started_at.isoformat(),
            }

    def get_last_evaluation_outcome(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get final evaluation outcome metadata for a run."""
        with self._jobs_lock:
            outcome = self._evaluation_outcomes.get(run_id)
            return deepcopy(outcome) if outcome else None

    def start_evaluation(
        self,
        run_id: str,
        num_episodes: int = 5,
        stream_frames: bool = True,
        target_fps: int = 30,
    ) -> Dict[str, Any]:
        """
        Start evaluation for a completed run in a background thread.

        Args:
            run_id: The run ID to evaluate
            num_episodes: Number of evaluation episodes (default 5)
            stream_frames: Whether to stream live frames (default True)
            target_fps: Target FPS for frame streaming (default 30)

        Returns:
            Dict with success status and message
        """
        # Check if already evaluating
        if self.is_evaluating(run_id):
            return {
                "success": False,
                "error": "Evaluation already in progress for this run",
            }

        # Check if training is in progress
        if self.is_training(run_id):
            return {
                "success": False,
                "error": "Cannot evaluate while training is in progress",
            }

        # Get run from database
        run_dict = runs_repository.get_run(run_id)
        if not run_dict:
            return {
                "success": False,
                "error": "Run not found",
            }

        # Check status - must be completed or stopped (has trained model)
        current_status = run_dict["status"]
        valid_statuses = [RunStatus.COMPLETED.value, RunStatus.STOPPED.value]
        if current_status not in valid_statuses:
            return {
                "success": False,
                "error": f"Cannot evaluate run in {current_status} status. "
                         f"Run must be completed or stopped.",
            }

        # Parse config
        config = json.loads(run_dict["config_json"])

        # Create stop event
        stop_event = threading.Event()

        # Create job
        job = EvaluationJob(
            run_id=run_id,
            thread=threading.Thread(target=lambda: None),  # Placeholder
            stop_event=stop_event,
            total_episodes=num_episodes,
        )

        # Store previous status to restore after evaluation
        previous_status = current_status

        # Evaluation thread function
        def evaluation_thread():
            summary: Optional[EvaluationSummary] = None
            succeeded = False
            error_message: Optional[str] = None
            try:
                # Update status to evaluating
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=RunStatus.EVALUATING,
                )

                # Log evaluation started
                algo = config.get('algorithm', 'unknown')
                env = config.get('env_id', 'unknown')
                events_repository.create_event(
                    run_id=run_id,
                    event_type=EventType.EVALUATION_STARTED,
                    message=f"Evaluation started: {num_episodes} episodes on {env}",
                    metadata={
                        "num_episodes": num_episodes,
                        "stream_frames": stream_frames,
                        "target_fps": target_fps,
                    },
                )

                # Create and run evaluator
                def on_episode_complete(current_episode: int, total_episodes: int):
                    job.current_episode = current_episode
                    job.total_episodes = total_episodes

                runner = EvaluationRunner(
                    run_id=run_id,
                    env_id=config.get("env_id"),
                    algorithm=config.get("algorithm"),
                    num_episodes=num_episodes,
                    seed=config.get("seed"),
                    stop_flag=stop_event.is_set,
                    on_episode_complete=on_episode_complete,
                    stream_frames=stream_frames,
                    target_fps=target_fps,
                    verbose=1,
                )

                summary = runner.run()
                succeeded = True

                # Log evaluation completed
                events_repository.create_event(
                    run_id=run_id,
                    event_type=EventType.EVALUATION_COMPLETED,
                    message=(f"Evaluation completed: {summary.num_episodes} episodes, "
                             f"mean reward: {summary.mean_reward:.2f}"),
                    metadata=summary.to_dict(),
                )

                # Restore previous status
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=RunStatus(previous_status),
                )

            except Exception as e:
                # Handle errors
                error_message = str(e)
                events_repository.create_event(
                    run_id=run_id,
                    event_type=EventType.ERROR,
                    message=f"Evaluation failed: {error_message}",
                )
                # Restore previous status on error
                runs_repository.update_run_status(
                    run_id=run_id,
                    status=RunStatus(previous_status),
                )

            finally:
                # Cleanup job from active jobs
                completed_at = datetime.now(timezone.utc).isoformat()
                with self._jobs_lock:
                    self._evaluation_outcomes[run_id] = {
                        "success": succeeded,
                        "restored_status": previous_status,
                        "summary": summary.to_dict() if summary else None,
                        "error": error_message,
                        "completed_at": completed_at,
                    }
                    if run_id in self._eval_jobs:
                        del self._eval_jobs[run_id]

        # Create thread
        thread = threading.Thread(
            target=evaluation_thread,
            name=f"eval-{run_id[:8]}",
            daemon=True,
        )
        job.thread = thread

        # Register job
        with self._jobs_lock:
            self._eval_jobs[run_id] = job
            self._evaluation_outcomes.pop(run_id, None)

        # Start evaluation
        thread.start()

        return {
            "success": True,
            "message": f"Evaluation started: {num_episodes} episodes",
        }

    def stop_evaluation(self, run_id: str) -> Dict[str, Any]:
        """
        Stop evaluation for a run.

        Args:
            run_id: The run ID to stop evaluation for

        Returns:
            Dict with success status and message
        """
        with self._jobs_lock:
            job = self._eval_jobs.get(run_id)

        if job is None:
            # Check if run exists and is in evaluating status
            run_dict = runs_repository.get_run(run_id)
            if not run_dict:
                return {
                    "success": False,
                    "error": "Run not found",
                }
            if run_dict["status"] != RunStatus.EVALUATING.value:
                return {
                    "success": False,
                    "error": (f"Run is not currently being evaluated "
                              f"(status: {run_dict['status']})"),
                }
            return {
                "success": False,
                "error": "Evaluation job not found in memory",
            }

        if not job.thread.is_alive():
            return {
                "success": False,
                "error": "Evaluation thread is not active",
            }

        # Signal stop
        job.stop_event.set()

        # Log stop request
        events_repository.create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Evaluation stop requested by user",
        )

        return {
            "success": True,
            "message": "Stop signal sent, evaluation will stop after current episode",
        }

    def cleanup(self) -> None:
        """Stop all active training and evaluation jobs."""
        with self._jobs_lock:
            # Stop training jobs
            for run_id, job in list(self._jobs.items()):
                if job.thread.is_alive():
                    job.stop_event.set()
            # Stop evaluation jobs
            for run_id, job in list(self._eval_jobs.items()):
                if job.thread.is_alive():
                    job.stop_event.set()


# Global instance getter
def get_training_manager() -> TrainingManager:
    """Get the global training manager instance."""
    return TrainingManager()
