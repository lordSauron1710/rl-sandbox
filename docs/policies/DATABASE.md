# Database And Persistence

## Current Baseline

- SQLite stores run metadata and queue state.
- Run artifacts are stored on disk under `RLV_RUNS_DIR`.

## Rules

- Keep SQL parameterized; do not build queries from untrusted values.
- Treat persisted run configuration and event metadata as untrusted when rendering.
- Keep database and artifact paths configured via environment variables, not hardcoded per host.
- For public deployments, back up both the SQLite file and artifact directory together.
- If the project moves from SQLite to Postgres or another DB, update `README.md`, `.env.example`, and deployment docs in the same change.
