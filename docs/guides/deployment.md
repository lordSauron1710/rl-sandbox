# Deployment Guide (Vercel Frontend + Self-Hosted Backend)

This repo now includes a concrete full-app deployment path with:

- Frontend on Vercel (`frontend/`)
- Backend on your own machine using Docker Compose + Caddy (`deploy/selfhosted/`)

This keeps platform cost at `$0/month` if you already have a machine to leave on.

## 0) What this repo automates

The repo fills the app-side deployment gap with:

- `deploy/selfhosted/docker-compose.yml`: backend + reverse proxy stack
- `deploy/selfhosted/Caddyfile`: HTTPS reverse proxy for the backend
- `deploy/selfhosted/backend.env.example`: production env template
- `scripts/selfhosted-backend.sh`: wrapper for env bootstrap, `docker compose`, API URL output, and `/data` backup/restore
- `scripts/vercel-frontend.sh`: wrapper for Vercel project linkage, env sync, and deploys from `frontend/`
- `scripts/deploy-selfhosted-app.sh`: one-command backend + production frontend deploy wrapper with health wait
- `make selfhosted-backend-*`: convenience commands

The repo cannot automate these external prerequisites for you:

- an always-on machine you control
- a public hostname that resolves to that machine
- router / firewall access for ports `80` and `443`

## 1) Frontend-only demo deployment (Vercel)

If you only want the no-cost UI demo:

1. Import this repository into Vercel.
2. Set the project root directory to `frontend`.
3. Deploy.

Notes:

- This mode is a frontend showcase only.
- Training/evaluation requires a reachable backend.
- Browser security prevents an HTTPS-hosted frontend from calling a local HTTP backend.

## 2) Full app deployment (own machine + Vercel)

### Prerequisites

- an always-on Linux/macOS machine or home server
- Docker Engine with Compose v2
- a public hostname for the backend, for example `api.example.com`
- ports `80` and `443` forwarded to that machine

### A) Clone the repo on the backend machine

```bash
git clone https://github.com/lordSauron1710/rl-sandbox.git
cd rl-sandbox
make selfhosted-backend-init-env \
  API_DOMAIN=api.example.com \
  FRONTEND_URL=https://your-project.vercel.app
```

This creates `deploy/selfhosted/backend.env`, derives `CORS_ORIGINS` and
`TRUSTED_HOSTS` from the two hostnames above.

### B) Review `deploy/selfhosted/backend.env`

Minimum values:

- `API_DOMAIN`: public hostname for the backend
- `FRONTEND_URL`: Vercel production frontend URL
- `CORS_ORIGINS`: same Vercel production frontend URL
- `TRUSTED_HOSTS`: backend hostname

Optional:

- `RLV_ACCESS_TOKEN`: set a long random token if you want an unlock screen before the app loads
- `CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app` if you want Vercel preview deployments to work too

### C) Validate backend prerequisites

```bash
make deploy-selfhosted-app-status
make selfhosted-backend-doctor
```

If the doctor passes, you can still run the backend steps manually:

```bash
bash scripts/selfhosted-backend.sh api-url
bash scripts/selfhosted-backend.sh config
bash scripts/selfhosted-backend.sh up
bash scripts/selfhosted-backend.sh ps
```

### D) Link the Vercel project once

```bash
make vercel-frontend-link
```

This requires either an existing `vercel login` session or `VERCEL_TOKEN`.
For non-interactive linking, set `VERCEL_PROJECT`, and optionally `VERCEL_SCOPE`.

### E) Deploy backend + production frontend

```bash
make deploy-selfhosted-app
```

The stack does this:

- builds the FastAPI backend from `backend/Dockerfile`
- stores SQLite + run artifacts in a Docker volume mounted at `/data`
- terminates HTTPS with Caddy
- exposes only Caddy on ports `80` and `443`
- waits for the public backend health endpoint before releasing the frontend
- syncs `NEXT_PUBLIC_API_URL` to the linked Vercel project
- runs a production frontend deploy from `frontend/`

### F) Verify the backend

```bash
curl https://<your-api-domain>/health
```

Expected result: a JSON payload with `"status": "healthy"`.

### G) Optional manual Vercel steps

If you do not want the Vercel helper script to manage the frontend, you can
still set the value printed by:

```bash
make selfhosted-backend-api-url
```

Then redeploy the frontend.

### H) Open the deployed frontend

Open the Vercel frontend.

- If `RLV_ACCESS_TOKEN` is set, the app will prompt once for it and exchange it
  for an HttpOnly session cookie on the backend domain.
- If `RLV_ACCESS_TOKEN` is blank, the app will load directly.

### I) Day-2 operations

```bash
make selfhosted-backend-logs
make selfhosted-backend-backup
make selfhosted-backend-down
```

Restore from a backup archive:

```bash
make selfhosted-backend-restore BACKUP=/absolute/path/to/backup.tar.gz
```

## 3) Deployment environment variables

### Self-hosted backend env file

File: `deploy/selfhosted/backend.env`

| Variable | Required | Example |
|---|---|---|
| `API_DOMAIN` | Yes | `api.example.com` |
| `APP_ENV` | Yes | `production` |
| `ENABLE_API_DOCS` | No | `false` |
| `RLV_ACCESS_TOKEN` | No | `long-random-secret` |
| `FRONTEND_URL` | Yes | `https://your-project.vercel.app` |
| `CORS_ORIGINS` | Yes | `https://your-project.vercel.app` |
| `CORS_ORIGIN_REGEX` | No | `https://.*\\.vercel\\.app` |
| `TRUSTED_HOSTS` | Yes | `api.example.com` |

### Vercel frontend

| Variable | Required | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api.example.com/api/v1` |

### Helper-only variables

| Variable | Required | Example |
|---|---|---|
| `VERCEL_TOKEN` | No | `vercel_xxxxx` |
| `VERCEL_PROJECT` | No | `your-project-name` |
| `VERCEL_SCOPE` | No | `your-team-or-username` |
| `VERCEL_DEPLOY_HOOK_URL` | No | `https://api.vercel.com/v1/integrations/deploy/...` |
| `VERCEL_PROJECT_DIR` | No | `/absolute/path/to/repo` |
| `SELFHOSTED_ENV_FILE` | No | `deploy/selfhosted/backend.env` |

## 4) Common issues

- Caddy cannot obtain HTTPS certificates:
  - Verify the hostname points to the machine's public IP.
  - Verify ports `80` and `443` are reachable from the internet.
- Vercel production works but previews fail:
  - Add `CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app` to `deploy/selfhosted/backend.env`.
- `400`/`403` from the backend:
  - Verify `TRUSTED_HOSTS` contains the public API hostname.
  - Verify `FRONTEND_URL` and `CORS_ORIGINS` exactly match the Vercel frontend origin.
- Frontend prompts for a token repeatedly:
  - Verify `RLV_ACCESS_TOKEN` in `deploy/selfhosted/backend.env`.
  - Confirm the backend is running over HTTPS so the secure session cookie can be set.
- Frontend should load directly but still shows the unlock screen:
  - Clear `RLV_ACCESS_TOKEN` in `deploy/selfhosted/backend.env`.
  - Recreate the backend container after changing the env file.
- Vercel helper fails:
  - Run `make vercel-frontend-status`.
  - Run `make vercel-frontend-doctor`.
  - Link the project with `make vercel-frontend-link`.
  - Export `VERCEL_TOKEN` if you need non-interactive CLI auth.
  - Set `VERCEL_PROJECT` for non-interactive linking, or `VERCEL_DEPLOY_HOOK_URL` if you only need a redeploy fallback.
- Health check fails:
  - Inspect container logs with `make selfhosted-backend-logs`.
  - Verify the backend machine can build the image and start the FastAPI container.
- Data disappears after recreation:
  - Do not remove the `rl_sandbox_data` Docker volume unless you intend to wipe state.

## 5) Security notes

- Never commit `deploy/selfhosted/backend.env`.
- Keep the backend public origin allowlist tight.
- Keep API docs disabled in public production unless you have a private/admin-only deployment.
- If you expose the backend publicly with no token, anyone who can reach the API can trigger training and evaluation workloads.
- Back up the persistent `/data` volume before host rebuilds or volume maintenance.
