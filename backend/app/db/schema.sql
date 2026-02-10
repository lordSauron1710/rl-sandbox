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

-- Jobs table: persistent local queue for background training/evaluation jobs
CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,
    job_type        TEXT NOT NULL CHECK (job_type IN ('training', 'evaluation')),
    status          TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled')
    ) DEFAULT 'queued',
    payload_json    TEXT NOT NULL,
    result_json     TEXT,
    error_message   TEXT,
    worker_id       TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    started_at      TEXT,
    completed_at    TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

-- Indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs(job_type, status);
