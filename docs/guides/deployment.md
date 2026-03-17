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
- `scripts/selfhosted-backend.sh`: wrapper for `docker compose`, Vercel API URL output, and `/data` backup/restore
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
cp deploy/selfhosted/backend.env.example deploy/selfhosted/backend.env
```

### B) Edit `deploy/selfhosted/backend.env`

Minimum values:

- `API_DOMAIN`: public hostname for the backend
- `RLV_ACCESS_TOKEN`: long random token used to unlock the backend from the frontend
- `FRONTEND_URL`: Vercel production frontend URL
- `CORS_ORIGINS`: same Vercel production frontend URL
- `TRUSTED_HOSTS`: backend hostname

Optional:

- `CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app` if you want Vercel preview deployments to work too

### C) Validate and start the backend stack

```bash
make selfhosted-backend-api-url
make selfhosted-backend-config
make selfhosted-backend-up
make selfhosted-backend-ps
```

Or without `make`:

```bash
bash scripts/selfhosted-backend.sh api-url
bash scripts/selfhosted-backend.sh config
bash scripts/selfhosted-backend.sh up
bash scripts/selfhosted-backend.sh ps
```

The stack does this:

- builds the FastAPI backend from `backend/Dockerfile`
- stores SQLite + run artifacts in a Docker volume mounted at `/data`
- terminates HTTPS with Caddy
- exposes only Caddy on ports `80` and `443`

### D) Verify the backend

```bash
curl https://<your-api-domain>/health
```

Expected result: a JSON payload with `"status": "healthy"`.

### E) Point Vercel at the backend

In the Vercel project for `frontend/`, set the value printed by:

```bash
make selfhosted-backend-api-url
```

Then redeploy the frontend.

### F) Unlock the backend from the deployed frontend

Open the Vercel frontend. On first use against the protected backend, the app
will prompt for the `RLV_ACCESS_TOKEN` value from `deploy/selfhosted/backend.env`
and exchange it for an HttpOnly session cookie on the backend domain.

### G) Day-2 operations

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
| `RLV_ACCESS_TOKEN` | Yes | `long-random-secret` |
| `FRONTEND_URL` | Yes | `https://your-project.vercel.app` |
| `CORS_ORIGINS` | Yes | `https://your-project.vercel.app` |
| `CORS_ORIGIN_REGEX` | No | `https://.*\\.vercel\\.app` |
| `TRUSTED_HOSTS` | Yes | `api.example.com` |

### Vercel frontend

| Variable | Required | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api.example.com/api/v1` |

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
- Health check fails:
  - Inspect container logs with `make selfhosted-backend-logs`.
  - Verify the backend machine can build the image and start the FastAPI container.
- Data disappears after recreation:
  - Do not remove the `rl_sandbox_data` Docker volume unless you intend to wipe state.

## 5) Security notes

- Never commit `deploy/selfhosted/backend.env`.
- Keep the backend public origin allowlist tight.
- Keep API docs disabled in public production unless you have a private/admin-only deployment.
- Set a strong `RLV_ACCESS_TOKEN` before exposing the backend to the internet.
- Back up the persistent `/data` volume before host rebuilds or volume maintenance.
