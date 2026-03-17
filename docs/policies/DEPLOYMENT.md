# Deployment Baseline

## Architecture

- Frontend: Next.js on Vercel or another static/Node-capable host
- Backend: one stateful FastAPI container/process with persistent disk
- Canonical no-monthly-bill deployment assets live under `deploy/selfhosted/`

## Non-Negotiables

- The backend must not be deployed as a serverless function for training/evaluation workloads.
- The backend must remain single-instance unless streaming/pubsub and worker coordination are redesigned.
- The backend must have persistent storage for both the SQLite DB and run artifacts.
- TLS must terminate at the edge or reverse proxy.

## Required Production Backend Settings

- `APP_ENV=production`
- `CORS_ORIGINS` and/or `FRONTEND_URL`
- `TRUSTED_HOSTS`
- `RLV_DB_PATH`
- `RLV_RUNS_DIR`

## Recommended Production Posture

- Keep API docs disabled in public production.
- For the self-hosted public path, use `RLV_ACCESS_TOKEN` if you want an unlock
  screen before the app loads. Leaving it blank makes the app open directly.
- Use the checked-in backend/Vercel helper scripts as the baseline deployment
  automation unless there is a documented reason to diverge.
- Frontend release automation should either use authenticated Vercel CLI access
  or a documented deploy-hook fallback; do not leave redeploy steps implicit.
- Keep a documented backup/restore path for the persistent `/data` volume.
- Do not depend on marketing-page free tiers staying available; keep deployment docs provider-agnostic where possible.
