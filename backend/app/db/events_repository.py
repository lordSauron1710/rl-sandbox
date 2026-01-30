"""
Repository for event database operations.
"""
import json
from datetime import datetime, timezone
from typing import Optional, List

from app.db.database import get_connection, dict_from_row
from app.models.event import EventType


def create_event(
    run_id: str,
    event_type: EventType,
    message: str,
    metadata: Optional[dict] = None,
) -> dict:
    """
    Create a new event in the database.
    
    Args:
        run_id: The run this event belongs to
        event_type: Type of event
        message: Event message
        metadata: Optional metadata dictionary
        
    Returns:
        The created event as a dictionary
    """
    now = datetime.now(timezone.utc).isoformat()
    metadata_json = json.dumps(metadata) if metadata else None
    
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO events (run_id, timestamp, event_type, message, metadata)
            VALUES (?, ?, ?, ?, ?)
            """,
            (run_id, now, event_type.value, message, metadata_json)
        )
        conn.commit()
        
        event_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return dict_from_row(row)


def get_event(event_id: int) -> Optional[dict]:
    """
    Get an event by ID.
    
    Args:
        event_id: The event's ID
        
    Returns:
        The event as a dictionary, or None if not found
    """
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return dict_from_row(row)


def list_events(
    run_id: str,
    event_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[dict], int]:
    """
    List events for a run with optional filtering and pagination.
    
    Args:
        run_id: The run to get events for
        event_type: Filter by event type
        limit: Maximum number of results
        offset: Pagination offset
        
    Returns:
        Tuple of (list of events, total count)
    """
    conditions = ["run_id = ?"]
    params = [run_id]
    
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)
    
    where_clause = "WHERE " + " AND ".join(conditions)
    
    with get_connection() as conn:
        # Get total count
        count_query = f"SELECT COUNT(*) as count FROM events {where_clause}"
        total = conn.execute(count_query, params).fetchone()["count"]
        
        # Get paginated results (newest first)
        query = f"""
            SELECT * FROM events 
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(query, params + [limit, offset]).fetchall()
        events = [dict_from_row(row) for row in rows]
        
        return events, total


def get_events_after(
    run_id: str,
    after_id: Optional[int] = None,
    limit: int = 100,
) -> List[dict]:
    """
    Get events after a specific event ID (for SSE streaming).
    
    Args:
        run_id: The run to get events for
        after_id: Get events with ID greater than this
        limit: Maximum number of results
        
    Returns:
        List of events
    """
    with get_connection() as conn:
        if after_id:
            query = """
                SELECT * FROM events 
                WHERE run_id = ? AND id > ?
                ORDER BY id ASC
                LIMIT ?
            """
            rows = conn.execute(query, (run_id, after_id, limit)).fetchall()
        else:
            query = """
                SELECT * FROM events 
                WHERE run_id = ?
                ORDER BY id ASC
                LIMIT ?
            """
            rows = conn.execute(query, (run_id, limit)).fetchall()
        
        return [dict_from_row(row) for row in rows]


def delete_events_for_run(run_id: str) -> int:
    """
    Delete all events for a run.
    
    Args:
        run_id: The run to delete events for
        
    Returns:
        Number of events deleted
    """
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM events WHERE run_id = ?", (run_id,))
        conn.commit()
        return cursor.rowcount
