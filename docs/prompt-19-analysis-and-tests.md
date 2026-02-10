# Prompt 19 - Deployment Integration Notes

## Scope

Prompt 19 required production deployment setup for:

- Frontend on Vercel
- Backend on Fly.io
- CORS + persistence + health checks
- Deployment documentation + security notes

## What was added

- `backend/Dockerfile` for Fly deployment.
- `fly.toml` with:
  - backend build target
  - `/data` volume mount
  - health check on `/health`
  - default runtime env (`RLV_DB_PATH`, `RLV_RUNS_DIR`)
- `frontend/vercel.json` with security/cache headers.
- `backend/app/db/database.py` now supports `RLV_DB_PATH`.
- `backend/app/main.py` CORS improvements:
  - supports `CORS_ORIGINS`
  - supports optional `FRONTEND_URL` append
  - supports optional `CORS_ORIGIN_REGEX` for preview domains
- README + `docs/deployment.md` deployment instructions.

## Edge cases covered

1. Dynamic preview origins:
   - Use `CORS_ORIGIN_REGEX` (for example `https://.*\\.vercel\\.app`) when per-commit preview domains change.
2. Persistent storage across restarts:
   - DB and artifacts point to `/data/...` via env vars.
3. Relative vs absolute DB paths:
   - `RLV_DB_PATH` resolves backend-relative when given relative values.
4. Duplicate/empty CORS origins:
   - backend origin parsing trims, de-duplicates, and keeps safe localhost defaults.
5. Missing parent directories for DB path:
   - backend creates parent directory before opening SQLite.

## Verification checklist

- Backend imports/compiles:
  - `python3 -m compileall backend/app`
- Frontend production build:
  - `cd frontend && npm run build`
- Validate local env parsing:
  - `make dev-check`
- Manual deploy smoke:
  - Fly health endpoint returns 200
  - Vercel frontend can call `GET /api/v1/environments` through configured backend URL

