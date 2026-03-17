# Prompt 18 - Background Worker Queue (Implementation Notes)

## Scope

Prompt 18 asked for an optional background worker when training/evaluation flow needs stronger responsiveness guardrails.  
Implemented approach:

- Keep training/evaluation execution in-process (to preserve live SSE/WS streaming behavior).
- Add a persistent SQLite job queue so start/evaluate intents are durable and cancellable.
- Run a local background worker thread that dequeues jobs and delegates execution to `TrainingManager`.

## Worker Design

### Queue Persistence

Added `jobs` table in `backend/app/db/schema.sql`:

- `id`, `run_id`, `job_type`, `status`, `payload_json`, `result_json`, `error_message`
- `worker_id`, `attempts`, `created_at`, `updated_at`, `started_at`, `completed_at`

Supported `job_type` values:

- `training`
- `evaluation`

Supported `status` values:

- `queued`
- `running`
- `cancel_requested`
- `completed`
- `failed`
- `cancelled`

### Execution Flow

1. API endpoint validates run state.
2. Endpoint enqueues a `jobs` record (instead of launching work directly).
3. Background worker claims queued jobs atomically.
4. Worker starts training/evaluation via existing `TrainingManager`.
5. Worker monitors completion and marks terminal job status.

### Why This Design

- Preserves existing metrics/frame streaming behavior (important for UX correctness).
- Adds durability and cancellation semantics around job scheduling.
- Keeps dependencies minimal (SQLite + existing Python stdlib threading).

## Edge Cases Covered

- Duplicate start/evaluate requests while queued/running -> conflict.
- Stop request for queued jobs -> immediate `cancelled` terminal state.
- Stop request for running jobs -> `cancel_requested` + graceful stop signal.
- Worker restart with stale active jobs -> stale `running/cancel_requested` entries marked failed once at startup.
- Run deleted/missing between enqueue and execution -> job marked failed.
- Run status drift (invalid status at execution time) -> job marked failed with explicit reason.
- Unexpected worker exceptions -> caught and persisted as `failed`.

## Minimal Code Changes Summary

- Added queue persistence module: `backend/app/db/jobs_repository.py`
- Extended schema: `backend/app/db/schema.sql`
- Added worker service: `backend/app/training/background_worker.py`
- Hooked worker lifecycle in app startup/shutdown: `backend/app/main.py`
- Routed start/stop + evaluate/stop through worker queue: `backend/app/routers/runs.py`
- Added manager outcome capture for robust terminal job classification: `backend/app/training/manager.py`
- Exported new components via module init files:
  - `backend/app/db/__init__.py`
  - `backend/app/training/__init__.py`

## Validation Checklist

- Syntax check: `python3 -m compileall backend/app`
- Backend smoke: `bash test-smoke.sh`
- Backend comprehensive: `bash test-comprehensive.sh`
- Manual edge checks:
  - queue + cancel-before-start
  - duplicate start conflict
  - evaluate queue + stop
  - status restoration after evaluation
