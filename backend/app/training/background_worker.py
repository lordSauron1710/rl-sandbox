"""
Persistent local background worker for training and evaluation jobs.

Uses a SQLite-backed queue so job intent survives API restarts, while still
delegating actual execution to the in-process training manager to preserve
existing streaming behavior.
"""
import json
import os
import threading
import time
import uuid
from typing import Any, Dict, Optional

from app.db import events_repository, jobs_repository, runs_repository
from app.models.event import EventType
from app.models.run import RunStatus
from app.training.manager import get_training_manager


class BackgroundJobWorker:
    """
    Dequeues training/evaluation jobs from SQLite and executes them locally.
    """

    _instance: Optional["BackgroundJobWorker"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "BackgroundJobWorker":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._state_lock = threading.Lock()
        self._poll_interval = 0.25
        self._worker_id = f"local-worker-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self._manager = get_training_manager()
        self._stale_recovered = False
        self._initialized = True

    def start(self) -> None:
        """Start worker thread if not already running."""
        with self._state_lock:
            if self._thread and self._thread.is_alive():
                return

            self._stop_event.clear()
            if not self._stale_recovered:
                jobs_repository.fail_stale_active_jobs(self._worker_id)
                self._stale_recovered = True
            self._thread = threading.Thread(
                target=self._run_loop,
                name="background-job-worker",
                daemon=True,
            )
            self._thread.start()

    def stop(self, join_timeout: float = 5.0) -> None:
        """Request worker stop and wait for a clean shutdown."""
        self._stop_event.set()
        with self._state_lock:
            thread = self._thread
            self._thread = None
        if thread and thread.is_alive():
            thread.join(timeout=join_timeout)

    def is_running(self) -> bool:
        with self._state_lock:
            return bool(self._thread and self._thread.is_alive())

    def has_active_training_job(self, run_id: str) -> bool:
        return jobs_repository.has_active_job_for_run(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_TRAINING,
        )

    def has_active_evaluation_job(self, run_id: str) -> bool:
        return jobs_repository.has_active_job_for_run(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_EVALUATION,
        )

    def enqueue_training(self, run_id: str) -> Dict[str, Any]:
        """Queue a training job for a run."""
        self.start()
        if self.has_active_training_job(run_id):
            return {
                "success": False,
                "error": "Training already queued or in progress for this run",
            }

        job = jobs_repository.create_job(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_TRAINING,
            payload={},
        )
        self._safe_create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Training queued for background worker",
            metadata={"job_id": job["id"], "job_type": "training"},
        )
        return {
            "success": True,
            "message": "Training queued",
            "job_id": job["id"],
        }

    def enqueue_evaluation(
        self,
        run_id: str,
        num_episodes: int,
        stream_frames: bool,
        target_fps: int,
    ) -> Dict[str, Any]:
        """Queue an evaluation job for a run."""
        self.start()
        if self.has_active_evaluation_job(run_id) or self._manager.is_evaluating(run_id):
            return {
                "success": False,
                "error": "Evaluation already queued or in progress for this run",
            }

        job = jobs_repository.create_job(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_EVALUATION,
            payload={
                "num_episodes": int(num_episodes),
                "stream_frames": bool(stream_frames),
                "target_fps": int(target_fps),
            },
        )
        self._safe_create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Evaluation queued for background worker",
            metadata={"job_id": job["id"], "job_type": "evaluation"},
        )
        return {
            "success": True,
            "message": f"Evaluation queued: {num_episodes} episodes",
            "job_id": job["id"],
        }

    def request_training_stop(self, run_id: str) -> Dict[str, Any]:
        """Stop a queued/running training job."""
        active = jobs_repository.get_active_job_for_run(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_TRAINING,
        )
        if active:
            job_id = int(active["id"])
            status = active["status"]
            if status == jobs_repository.JOB_STATUS_QUEUED:
                jobs_repository.mark_cancelled(
                    job_id,
                    result={"reason": "cancelled_before_start"},
                )
                self._mark_run_stopped_if_not_terminal(run_id)
                self._safe_create_event(
                    run_id=run_id,
                    event_type=EventType.INFO,
                    message="Queued training cancelled before start",
                    metadata={"job_id": job_id},
                )
                return {
                    "success": True,
                    "message": "Queued training cancelled before start",
                }

            jobs_repository.request_cancel(job_id)
            result = self._manager.stop_training(run_id)
            if result["success"]:
                return result
            return {
                "success": True,
                "message": "Stop requested for training job",
            }

        return self._manager.stop_training(run_id)

    def request_evaluation_stop(self, run_id: str) -> Dict[str, Any]:
        """Stop a queued/running evaluation job."""
        active = jobs_repository.get_active_job_for_run(
            run_id=run_id,
            job_type=jobs_repository.JOB_TYPE_EVALUATION,
        )
        if active:
            job_id = int(active["id"])
            status = active["status"]
            if status == jobs_repository.JOB_STATUS_QUEUED:
                jobs_repository.mark_cancelled(
                    job_id,
                    result={"reason": "cancelled_before_start"},
                )
                self._safe_create_event(
                    run_id=run_id,
                    event_type=EventType.INFO,
                    message="Queued evaluation cancelled before start",
                    metadata={"job_id": job_id},
                )
                return {
                    "success": True,
                    "message": "Queued evaluation cancelled before start",
                }

            jobs_repository.request_cancel(job_id)
            result = self._manager.stop_evaluation(run_id)
            if result["success"]:
                return result
            return {
                "success": True,
                "message": "Stop requested for evaluation job",
            }

        return self._manager.stop_evaluation(run_id)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            job = jobs_repository.claim_next_queued_job(worker_id=self._worker_id)
            if not job:
                time.sleep(self._poll_interval)
                continue

            job_id = int(job["id"])
            try:
                job_type = job["job_type"]
                if job_type == jobs_repository.JOB_TYPE_TRAINING:
                    self._execute_training_job(job)
                elif job_type == jobs_repository.JOB_TYPE_EVALUATION:
                    self._execute_evaluation_job(job)
                else:
                    jobs_repository.mark_failed(
                        job_id,
                        f"Unknown job type: {job_type}",
                    )
            except Exception as exc:
                jobs_repository.mark_failed(
                    job_id,
                    f"Worker execution error: {exc}",
                )

    def _execute_training_job(self, job: dict) -> None:
        run_id = job["run_id"]
        job_id = int(job["id"])

        run = runs_repository.get_run(run_id)
        if not run:
            jobs_repository.mark_failed(job_id, "Run not found")
            return
        if run["status"] not in (RunStatus.PENDING.value, RunStatus.STOPPED.value):
            jobs_repository.mark_failed(
                job_id,
                f"Run is in {run['status']} status and cannot be trained",
            )
            return

        self._safe_create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Background worker started training job",
            metadata={"job_id": job_id},
        )

        if self._is_cancel_requested(job_id):
            jobs_repository.mark_cancelled(
                job_id,
                result={"reason": "cancelled_before_runner_start"},
            )
            self._mark_run_stopped_if_not_terminal(run_id)
            return

        start_result = self._manager.start_training(run_id)
        if (
            not start_result["success"]
            and "already in progress" in str(start_result.get("error", "")).lower()
        ):
            # Small handoff window: run status may already be stopped/completed
            # while manager cleanup still removes the previous in-memory job.
            deadline = time.time() + 5.0
            while self._manager.is_training(run_id) and time.time() < deadline:
                time.sleep(self._poll_interval)
            start_result = self._manager.start_training(run_id)

        if not start_result["success"]:
            if self._is_cancel_requested(job_id):
                jobs_repository.mark_cancelled(
                    job_id,
                    result={"reason": "cancelled_before_runner_start"},
                )
            else:
                jobs_repository.mark_failed(job_id, start_result["error"])
            return

        self._monitor_training_job(run_id, job_id)

    def _monitor_training_job(self, run_id: str, job_id: int) -> None:
        while self._manager.is_training(run_id):
            if self._is_cancel_requested(job_id):
                self._manager.stop_training(run_id)
            if self._stop_event.wait(self._poll_interval):
                # API is shutting down; request graceful stop and continue monitoring.
                self._manager.stop_training(run_id)
                jobs_repository.request_cancel(job_id)

        run = runs_repository.get_run(run_id)
        outcome = self._manager.get_last_training_outcome(run_id)
        run_status = run["status"] if run else None
        result_payload = {
            "run_status": run_status,
            "manager_outcome": outcome,
        }
        cancel_requested = self._is_cancel_requested(job_id)

        if run_status == RunStatus.FAILED.value:
            error_msg = "Training finished with failed status"
            if outcome and outcome.get("error"):
                error_msg = str(outcome["error"])
            jobs_repository.mark_failed(job_id, error_msg, result=result_payload)
            return

        if cancel_requested and run_status == RunStatus.STOPPED.value:
            jobs_repository.mark_cancelled(job_id, result=result_payload)
            return

        if run_status in (RunStatus.COMPLETED.value, RunStatus.STOPPED.value):
            jobs_repository.mark_completed(job_id, result=result_payload)
            return

        jobs_repository.mark_failed(
            job_id,
            f"Training finished in unexpected status: {run_status}",
            result=result_payload,
        )

    def _execute_evaluation_job(self, job: dict) -> None:
        run_id = job["run_id"]
        job_id = int(job["id"])

        run = runs_repository.get_run(run_id)
        if not run:
            jobs_repository.mark_failed(job_id, "Run not found")
            return
        if run["status"] not in (RunStatus.COMPLETED.value, RunStatus.STOPPED.value):
            jobs_repository.mark_failed(
                job_id,
                f"Run is in {run['status']} status and cannot be evaluated",
            )
            return

        payload = self._parse_payload(job.get("payload_json"))
        num_episodes = max(1, min(100, int(payload.get("num_episodes", 5))))
        stream_frames = bool(payload.get("stream_frames", True))
        target_fps = max(1, min(30, int(payload.get("target_fps", 30))))

        self._safe_create_event(
            run_id=run_id,
            event_type=EventType.INFO,
            message="Background worker started evaluation job",
            metadata={"job_id": job_id},
        )

        if self._is_cancel_requested(job_id):
            jobs_repository.mark_cancelled(
                job_id,
                result={"reason": "cancelled_before_runner_start"},
            )
            return

        start_result = self._manager.start_evaluation(
            run_id=run_id,
            num_episodes=num_episodes,
            stream_frames=stream_frames,
            target_fps=target_fps,
        )
        if not start_result["success"]:
            if self._is_cancel_requested(job_id):
                jobs_repository.mark_cancelled(
                    job_id,
                    result={"reason": "cancelled_before_runner_start"},
                )
            else:
                jobs_repository.mark_failed(job_id, start_result["error"])
            return

        self._monitor_evaluation_job(run_id, job_id)

    def _monitor_evaluation_job(self, run_id: str, job_id: int) -> None:
        while self._manager.is_evaluating(run_id):
            if self._is_cancel_requested(job_id):
                self._manager.stop_evaluation(run_id)
            if self._stop_event.wait(self._poll_interval):
                self._manager.stop_evaluation(run_id)
                jobs_repository.request_cancel(job_id)

        run = runs_repository.get_run(run_id)
        outcome = self._manager.get_last_evaluation_outcome(run_id)
        run_status = run["status"] if run else None
        result_payload = {
            "run_status": run_status,
            "manager_outcome": outcome,
        }
        cancel_requested = self._is_cancel_requested(job_id)

        if outcome and not outcome.get("success", False):
            jobs_repository.mark_failed(
                job_id,
                str(outcome.get("error") or "Evaluation failed"),
                result=result_payload,
            )
            return

        if cancel_requested:
            jobs_repository.mark_cancelled(job_id, result=result_payload)
            return

        if run_status in (RunStatus.COMPLETED.value, RunStatus.STOPPED.value):
            jobs_repository.mark_completed(job_id, result=result_payload)
            return

        jobs_repository.mark_failed(
            job_id,
            f"Evaluation finished in unexpected status: {run_status}",
            result=result_payload,
        )

    @staticmethod
    def _parse_payload(payload_json: Optional[str]) -> dict:
        if not payload_json:
            return {}
        try:
            payload = json.loads(payload_json)
            return payload if isinstance(payload, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _is_cancel_requested(self, job_id: int) -> bool:
        job = jobs_repository.get_job(job_id)
        if not job:
            return False
        return job["status"] == jobs_repository.JOB_STATUS_CANCEL_REQUESTED

    @staticmethod
    def _mark_run_stopped_if_not_terminal(run_id: str) -> None:
        run = runs_repository.get_run(run_id)
        if not run:
            return
        if run["status"] in (RunStatus.COMPLETED.value, RunStatus.STOPPED.value, RunStatus.FAILED.value):
            return
        runs_repository.update_run_status(
            run_id=run_id,
            status=RunStatus.STOPPED,
        )

    @staticmethod
    def _safe_create_event(
        run_id: str,
        event_type: EventType,
        message: str,
        metadata: Optional[dict] = None,
    ) -> None:
        try:
            events_repository.create_event(
                run_id=run_id,
                event_type=event_type,
                message=message,
                metadata=metadata,
            )
        except Exception:
            # Queue processing should continue even if event logging fails.
            pass


def get_background_worker() -> BackgroundJobWorker:
    """Get the singleton background worker."""
    return BackgroundJobWorker()
