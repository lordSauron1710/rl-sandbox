# Deployment Baseline

## Architecture

- Frontend: Next.js on Vercel or another static/Node-capable host
- Backend: one stateful FastAPI container/process with persistent disk

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
- Restrict public exposure of unauthenticated training endpoints behind a private network, reverse proxy policy, or future auth layer.
- Do not depend on marketing-page free tiers staying available; keep deployment docs provider-agnostic where possible.
