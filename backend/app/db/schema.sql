-- RL Gym Visualizer - SQLite Schema
-- Version: 1.0.0

-- Runs table: stores metadata for each training/evaluation run
CREATE TABLE IF NOT EXISTS runs (
    id              TEXT PRIMARY KEY,
    env_id          TEXT NOT NULL,
    algorithm       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    config_json     TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    started_at      TEXT,
    completed_at    TEXT
);

-- Indexes for runs table
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_env_id ON runs(env_id);

-- Events table: stores event log entries for each run
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    message     TEXT NOT NULL,
    metadata    TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
