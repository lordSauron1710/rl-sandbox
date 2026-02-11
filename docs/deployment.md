# Deployment Guide (Vercel Frontend + Fly.io Backend)

This project is deployed as two services:

- Frontend: Vercel (`frontend/`)
- Backend: Fly.io (`backend/`)

## 0) Frontend-only demo deployment (Vercel)

If you only want a no-cost UI/demo deployment:

1. Import this repository into Vercel.
2. Set the project root directory to `frontend`.
3. Deploy.

Notes:

- This mode is a frontend showcase only.
- Training/evaluation requires a reachable backend.
- Recommend users run the full app locally (`make install && make dev`) for end-to-end functionality.

## 1) Backend deployment (Fly.io)

### Prerequisites

- Install Fly CLI: `flyctl`
- Authenticate: `fly auth login`

### One-time setup

1. Update `app` in `fly.toml` to your unique Fly app name.
2. Create the app (if it does not exist yet):
   - `fly apps create <your-app-name>`
3. Create persistent volume for SQLite + artifacts:
   - `fly volumes create rl_data --region ord --size 3`

### Configure backend environment

Set these on Fly:

- `CORS_ORIGINS=https://<your-vercel-domain>`
- Optional preview support: `CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app`
- Optional explicit frontend URL: `FRONTEND_URL=https://<your-vercel-domain>`

Example:

```bash
fly secrets set \
  CORS_ORIGINS="https://your-app.vercel.app" \
  CORS_ORIGIN_REGEX="https://.*\\.vercel\\.app"
```

### Deploy backend

```bash
fly deploy
```

After deploy:

- Health endpoint: `https://<your-app-name>.fly.dev/health`
- API base URL for frontend: `https://<your-app-name>.fly.dev/api/v1`

## 2) Frontend deployment (Vercel)

1. Import repo in Vercel.
2. Set project root directory to `frontend`.
3. Set env var in Vercel project settings:
   - `NEXT_PUBLIC_API_URL=https://<your-app-name>.fly.dev/api/v1`
4. Deploy.

`frontend/vercel.json` defines production headers for security and static asset caching.

## 3) Deployment environment variables

### Backend (Fly.io)

| Variable | Required | Value |
|---|---|---|
| `RLV_DB_PATH` | Yes | `/data/rl_visualizer.db` |
| `RLV_RUNS_DIR` | Yes | `/data/runs` |
| `CORS_ORIGINS` | Yes | `https://<your-vercel-domain>` |
| `CORS_ORIGIN_REGEX` | Optional | `https://.*\\.vercel\\.app` |
| `FRONTEND_URL` | Optional | `https://<your-vercel-domain>` |

### Frontend (Vercel)

| Variable | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `https://<your-app-name>.fly.dev/api/v1` |

## 4) Common issues

- `403` or browser CORS errors:
  - Verify `CORS_ORIGINS` exactly matches the Vercel origin (protocol + hostname).
  - If preview deployments fail, add `CORS_ORIGIN_REGEX`.
- Data disappears after restart:
  - Confirm Fly volume exists and `fly.toml` mount source is `rl_data`.
  - Confirm `RLV_DB_PATH` and `RLV_RUNS_DIR` point to `/data/...`.
- Frontend cannot reach backend:
  - Ensure `NEXT_PUBLIC_API_URL` includes `/api/v1`.
  - Redeploy frontend after env var changes.
- Health check fails:
  - Verify backend responds on `/health` and internal port `8000`.
  - Check logs: `fly logs`.

## 5) Security notes

- Never commit secrets (`.env`, tokens, API keys, credentials).
- Store secrets only in Fly/Vercel environment variable management.
- Keep local secret files gitignored.
- Rotate leaked credentials immediately and redeploy.
