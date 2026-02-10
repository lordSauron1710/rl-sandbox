"""
Repository for background job queue database operations.
"""
import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional, List

from app.db.database import get_connection, dict_from_row

# Job types
JOB_TYPE_TRAINING = "training"
JOB_TYPE_EVALUATION = "evaluation"

# Job statuses
JOB_STATUS_QUEUED = "queued"
JOB_STATUS_RUNNING = "running"
JOB_STATUS_CANCEL_REQUESTED = "cancel_requested"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"
JOB_STATUS_CANCELLED = "cancelled"

ACTIVE_JOB_STATUSES = (
    JOB_STATUS_QUEUED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_CANCEL_REQUESTED,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dumps(value: Optional[dict]) -> str:
    return json.dumps(value or {})


def create_job(
    run_id: str,
    job_type: str,
    payload: Optional[dict] = None,
) -> dict:
    """
    Create a queued background job.
    """
    now = _now_iso()
    payload_json = _dumps(payload)

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO jobs (
                run_id, job_type, status, payload_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                job_type,
                JOB_STATUS_QUEUED,
                payload_json,
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM jobs WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict_from_row(row)


def get_job(job_id: int) -> Optional[dict]:
    """
    Get a job by ID.
    """
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict_from_row(row)


def list_jobs(
    run_id: Optional[str] = None,
    job_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[dict]:
    """
    List jobs with optional filters.
    """
    conditions: list[str] = []
    params: list[object] = []

    if run_id:
        conditions.append("run_id = ?")
        params.append(run_id)
    if job_type:
        conditions.append("job_type = ?")
        params.append(job_type)
    if status:
        conditions.append("status = ?")
        params.append(status)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM jobs
            {where_clause}
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        return [dict_from_row(row) for row in rows]


def get_active_job_for_run(
    run_id: str,
    job_type: Optional[str] = None,
) -> Optional[dict]:
    """
    Get the most recent active job for a run.
    """
    conditions = ["run_id = ?", "status IN (?, ?, ?)"]
    params: list[object] = [
        run_id,
        JOB_STATUS_QUEUED,
        JOB_STATUS_RUNNING,
        JOB_STATUS_CANCEL_REQUESTED,
    ]
    if job_type:
        conditions.append("job_type = ?")
        params.append(job_type)

    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT * FROM jobs
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
        return dict_from_row(row)


def has_active_job_for_run(run_id: str, job_type: Optional[str] = None) -> bool:
    """
    Check whether a run has an active queued/running/cancel_requested job.
    """
    return get_active_job_for_run(run_id=run_id, job_type=job_type) is not None


def claim_next_queued_job(worker_id: str) -> Optional[dict]:
    """
    Atomically claim the next queued job.
    """
    now = _now_iso()
    try:
        with get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            candidate = conn.execute(
                """
                SELECT id FROM jobs
                WHERE status = ?
                ORDER BY created_at ASC, id ASC
                LIMIT 1
                """,
                (JOB_STATUS_QUEUED,),
            ).fetchone()
            if candidate is None:
                conn.commit()
                return None

            job_id = int(candidate["id"])
            updated = conn.execute(
                """
                UPDATE jobs
                SET status = ?,
                    worker_id = ?,
                    started_at = COALESCE(started_at, ?),
                    updated_at = ?,
                    attempts = attempts + 1
                WHERE id = ? AND status = ?
                """,
                (
                    JOB_STATUS_RUNNING,
                    worker_id,
                    now,
                    now,
                    job_id,
                    JOB_STATUS_QUEUED,
                ),
            )
            if updated.rowcount != 1:
                conn.commit()
                return None

            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            conn.commit()
            return dict_from_row(row)
    except sqlite3.OperationalError:
        # Transient SQLite lock contention, caller can retry on next poll.
        return None


def request_cancel(job_id: int) -> Optional[dict]:
    """
    Mark a queued/running job as cancel_requested.
    """
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?,
                updated_at = ?
            WHERE id = ? AND status IN (?, ?)
            """,
            (
                JOB_STATUS_CANCEL_REQUESTED,
                now,
                job_id,
                JOB_STATUS_QUEUED,
                JOB_STATUS_RUNNING,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict_from_row(row)


def mark_completed(job_id: int, result: Optional[dict] = None) -> Optional[dict]:
    """
    Mark a job as completed with optional result payload.
    """
    now = _now_iso()
    result_json = _dumps(result)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?,
                result_json = ?,
                error_message = NULL,
                completed_at = ?,
                updated_at = ?
            WHERE id = ? AND status IN (?, ?)
            """,
            (
                JOB_STATUS_COMPLETED,
                result_json,
                now,
                now,
                job_id,
                JOB_STATUS_RUNNING,
                JOB_STATUS_CANCEL_REQUESTED,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict_from_row(row)


def mark_cancelled(job_id: int, result: Optional[dict] = None) -> Optional[dict]:
    """
    Mark a job as cancelled.
    """
    now = _now_iso()
    result_json = _dumps(result)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?,
                result_json = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ? AND status IN (?, ?, ?)
            """,
            (
                JOB_STATUS_CANCELLED,
                result_json,
                now,
                now,
                job_id,
                JOB_STATUS_QUEUED,
                JOB_STATUS_RUNNING,
                JOB_STATUS_CANCEL_REQUESTED,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict_from_row(row)


def mark_failed(
    job_id: int,
    error_message: str,
    result: Optional[dict] = None,
) -> Optional[dict]:
    """
    Mark a job as failed.
    """
    now = _now_iso()
    result_json = _dumps(result)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?,
                error_message = ?,
                result_json = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ? AND status IN (?, ?, ?)
            """,
            (
                JOB_STATUS_FAILED,
                error_message[:2000],
                result_json,
                now,
                now,
                job_id,
                JOB_STATUS_QUEUED,
                JOB_STATUS_RUNNING,
                JOB_STATUS_CANCEL_REQUESTED,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict_from_row(row)


def fail_stale_active_jobs(worker_id: str) -> int:
    """
    Fail jobs that were left active across a restart.

    Returns:
        Number of jobs transitioned to failed.
    """
    now = _now_iso()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE jobs
            SET status = ?,
                error_message = ?,
                worker_id = ?,
                completed_at = ?,
                updated_at = ?
            WHERE status IN (?, ?)
            """,
            (
                JOB_STATUS_FAILED,
                "Worker restarted before queued task completed",
                worker_id,
                now,
                now,
                JOB_STATUS_RUNNING,
                JOB_STATUS_CANCEL_REQUESTED,
            ),
        )
        conn.commit()
        return int(cursor.rowcount)
