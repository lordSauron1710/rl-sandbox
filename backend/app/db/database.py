"""
Database connection and initialization for RL Gym Visualizer.
"""
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Generator

# Database file location
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "rl_visualizer.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_db_path() -> Path:
    """
    Resolve the SQLite path from environment.

    `RLV_DB_PATH` supports absolute paths and backend-relative paths.
    """
    raw_path = os.getenv("RLV_DB_PATH", "").strip()
    if not raw_path:
        return DEFAULT_DB_PATH

    db_path = Path(raw_path).expanduser()
    if not db_path.is_absolute():
        db_path = BACKEND_DIR / db_path
    return db_path


def init_db() -> None:
    """Initialize the database with schema if it doesn't exist."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as conn:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()


@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """Get a database connection with row factory enabled."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def dict_from_row(row: sqlite3.Row | None) -> dict | None:
    """Convert a sqlite3.Row to a dictionary."""
    if row is None:
        return None
    return dict(row)
