# Security Baseline

This repo is a split web app:

- `frontend/`: public Next.js UI
- `backend/`: FastAPI service that can trigger long-running RL workloads

## Core Rules

- Never commit secrets, tokens, private keys, or `.env` files.
- Treat every browser-delivered value as public. `NEXT_PUBLIC_*` values are not secrets.
- Treat all network input as untrusted, including run configs, query params, WebSocket messages, and persisted user content.
- Do not invent client-side security boundaries. Hidden UI, disabled buttons, and local state are not authorization.
- Prefer explicit validation and narrow allowlists over permissive defaults.

## Production Baseline

- Run the backend with `APP_ENV=production`.
- Keep interactive API docs disabled in production unless the deployment is private/admin-only.
- Set strict `CORS_ORIGINS` and/or `FRONTEND_URL`.
- Set `TRUSTED_HOSTS` for public deployments.
- Terminate TLS at the edge or proxy; do not expose plain HTTP to the public internet.
- Deploy the backend as a single stateful instance unless the queue/pubsub architecture is redesigned. Current training workers and streams are process-local.
- Public internet exposure of unauthenticated training/evaluation endpoints is not acceptable without an additional control such as auth, a private network boundary, or a trusted reverse proxy.

## Dependency Hygiene

- Patch production dependencies promptly.
- Keep Next.js on a patched release line.
- Keep Pillow and other image/video dependencies on patched releases.
- Document accepted risk if a security-sensitive dependency cannot be upgraded immediately.

## Required Checks Before Shipping Security-Sensitive Changes

- `cd frontend && npm audit --omit=dev`
- `backend/.venv/bin/pip-audit -r backend/requirements.txt`
- `cd frontend && npm run build`
- `backend/.venv/bin/python -m compileall backend/app`
