"""
Repository for run database operations.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from app.db.database import get_connection, dict_from_row
from app.models.run import RunStatus


def create_run(
    env_id: str,
    algorithm: str,
    config: dict,
) -> dict:
    """
    Create a new run in the database.
    
    Args:
        env_id: Environment identifier
        algorithm: Algorithm name (PPO or DQN)
        config: Full configuration dictionary
        
    Returns:
        The created run as a dictionary
    """
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    config_json = json.dumps(config)
    
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO runs (id, env_id, algorithm, status, config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, env_id, algorithm, RunStatus.PENDING.value, config_json, now, now)
        )
        conn.commit()
        
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return dict_from_row(row)


def get_run(run_id: str) -> Optional[dict]:
    """
    Get a run by ID.
    
    Args:
        run_id: The run's UUID
        
    Returns:
        The run as a dictionary, or None if not found
    """
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return dict_from_row(row)


def list_runs(
    status: Optional[str] = None,
    env_id: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[dict], int]:
    """
    List runs with optional filtering and pagination.
    
    Args:
        status: Filter by status
        env_id: Filter by environment ID
        limit: Maximum number of results
        offset: Pagination offset
        
    Returns:
        Tuple of (list of runs, total count)
    """
    conditions = []
    params = []
    
    if status:
        conditions.append("status = ?")
        params.append(status)
    if env_id:
        conditions.append("env_id = ?")
        params.append(env_id)
    
    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
    
    with get_connection() as conn:
        # Get total count
        count_query = f"SELECT COUNT(*) as count FROM runs {where_clause}"
        total = conn.execute(count_query, params).fetchone()["count"]
        
        # Get paginated results
        query = f"""
            SELECT * FROM runs 
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(query, params + [limit, offset]).fetchall()
        runs = [dict_from_row(row) for row in rows]
        
        return runs, total


def update_run_status(
    run_id: str,
    status: RunStatus,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
) -> Optional[dict]:
    """
    Update a run's status and timestamps.
    
    Args:
        run_id: The run's UUID
        status: New status
        started_at: When training started (optional)
        completed_at: When training completed (optional)
        
    Returns:
        The updated run, or None if not found
    """
    now = datetime.now(timezone.utc).isoformat()
    
    with get_connection() as conn:
        # Build update query dynamically
        updates = ["status = ?", "updated_at = ?"]
        params = [status.value, now]
        
        if started_at:
            updates.append("started_at = ?")
            params.append(started_at.isoformat())
        if completed_at:
            updates.append("completed_at = ?")
            params.append(completed_at.isoformat())
        
        params.append(run_id)
        
        conn.execute(
            f"UPDATE runs SET {', '.join(updates)} WHERE id = ?",
            params
        )
        conn.commit()
        
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return dict_from_row(row)


def delete_run(run_id: str) -> bool:
    """
    Delete a run from the database.
    
    Args:
        run_id: The run's UUID
        
    Returns:
        True if deleted, False if not found
    """
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        conn.commit()
        return cursor.rowcount > 0
