# RL Sandbox (RL Gym Visualizer)

Lightweight RL training + evaluation visualizer built with FastAPI (backend) and Next.js (frontend).

![Latest UI Sample](docs/assets/frontend-design-reference.png)

## What this project does

- Trains RL agents with PPO and DQN (SB3).
- Applies training presets (`fast`, `stable`, `high_score`) with server-side bounds validation.
- Streams live metrics over SSE and live environment frames over WebSocket.
- Records evaluation runs and serves MP4 artifacts.
- Queues training/evaluation jobs in SQLite for resilient local background execution.
- Provides a responsive 3-column dashboard for environment setup, live feed, and logs.

## Architecture

```
Frontend (Next.js)  <---- REST / SSE / WS ---->  Backend (FastAPI + Gymnasium + SB3)
        Vercel-ish                                Fly.io-ish / long-running process
```

## Supported environments

| Environment | Action Space | Observation Space | Algorithms |
|---|---|---|---|
| `LunarLander-v3` | Discrete (4) | Box(8) | PPO, DQN |
| `CartPole-v1` | Discrete (2) | Box(4) | PPO, DQN |
| `BipedalWalker-v3` | Continuous (4) | Box(24) | PPO |

## Repository layout

```text
rl-sandbox/
├── backend/
│   ├── app/
│   │   ├── db/            # SQLite schema + repositories
│   │   ├── models/        # Pydantic/domain models
│   │   ├── routers/       # REST endpoints
│   │   ├── streaming/     # SSE / WebSocket infrastructure
│   │   ├── storage/       # Run artifact storage
│   │   ├── training/      # Training/evaluation runners
│   │   └── main.py
│   ├── Dockerfile         # Fly.io runtime image
│   └── requirements.txt
├── frontend/
│   ├── src/app/           # Next app shell/page
│   ├── src/components/    # Dashboard UI
│   ├── src/hooks/         # Runtime hooks (training/streaming)
│   ├── src/services/      # API client
│   └── vercel.json        # Vercel headers/build config
├── scripts/
│   └── dev.sh             # One-command local dev runner
├── .env.example           # Shared backend/frontend local env template
├── fly.toml               # Fly.io backend deployment config
├── docs/
│   ├── assets/            # Reference and screenshot images
│   └── deployment.md      # Deployment guide
├── roadmap.md             # Prompt roadmap
├── errors.md              # Known issues + latest working fixes
├── test-smoke.sh
└── test-comprehensive.sh
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm

## Quick start

### 1) Configure local env vars (optional but recommended)

```bash
cp .env.example .env
```

Update `.env` if you need non-default ports, backend URL, or custom run-artifact/DB location.

### 2) Start backend + frontend with one command

```bash
make dev
```

`make dev` runs `scripts/dev.sh` and will:

- Load `.env` / `.env.local` if present
- Auto-create `backend/.venv` and install Python deps when needed
- Auto-install frontend deps when lockfile changes
- Start backend + frontend together and shut both down cleanly

```bash
make dev-check
```

Use `make dev-check` to validate env vars, dependency state, and paths without starting servers.

Services:

- Frontend: `http://127.0.0.1:3000`
- Backend API: `http://127.0.0.1:8000`
- Backend docs: `http://127.0.0.1:8000/docs`

## Deployment (Vercel + Fly.io)

- Backend deploy config:
  - `fly.toml`
  - `backend/Dockerfile`
- Frontend deploy config:
  - `frontend/vercel.json`

Quick path:

1. Deploy backend to Fly.io and create volume `rl_data`.
2. Set backend env/secrets (`CORS_ORIGINS`, optional `CORS_ORIGIN_REGEX`).
3. Deploy frontend from `frontend/` on Vercel.
4. Set Vercel env `NEXT_PUBLIC_API_URL=https://<fly-app>.fly.dev/api/v1`.

Full guide: `docs/deployment.md`

Security note:

- Never commit secrets (`.env`, API keys, tokens).
- Use Fly/Vercel managed env vars/secrets for sensitive values.

## Test commands

Backend must be running first.

```bash
make test-smoke
make test
```

GitHub Actions automation:

- `Frontend Build` + `Backend Smoke` run on every push (`main`, `codex/**`) and pull request.
- `Backend Comprehensive` runs on push to `main`, nightly schedule, or manual workflow dispatch (with `run_comprehensive=true`).

Manual invocation with explicit host (useful on some systems):

```bash
API_BASE=http://127.0.0.1:8000/api/v1 HEALTH_URL=http://127.0.0.1:8000/health bash test-smoke.sh
API_BASE=http://127.0.0.1:8000/api/v1 HEALTH_URL=http://127.0.0.1:8000/health bash test-comprehensive.sh
```

## Key API routes

Base API: `http://localhost:8000/api/v1`

| Route | Method | Purpose |
|---|---|---|
| `/environments` | GET | List available environments |
| `/environments/{id}/preview` | GET | Get idle preview frame (JPEG) |
| `/runs/presets` | GET | List preset tables + hyperparameter bounds |
| `/runs` | POST | Create run |
| `/runs/{id}/start` | POST | Queue/start training |
| `/runs/{id}/stop` | POST | Stop training |
| `/runs/{id}/evaluate` | POST | Queue/start evaluation |
| `/runs/{id}/stream/metrics` | GET (SSE) | Live metrics stream |
| `/runs/{id}/ws/frames` | WS | Live frame stream |
| `/runs/{id}/artifacts/*` | GET | Config/metrics/eval artifacts |

Use FastAPI docs (`http://localhost:8000/docs`) for full request/response schemas.

## Environment variables

`make dev` / `scripts/dev.sh` read env vars from shell and optional `.env` files.

| Variable | Scope | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend | `http://127.0.0.1:8000/api/v1` | Backend API base URL used by Next.js client code |
| `RLV_RUNS_DIR` | Backend | `<repo>/backend/runs` | Path for run artifacts; relative values are resolved from repo root by `scripts/dev.sh` |
| `RLV_DB_PATH` | Backend | `<repo>/backend/data/rl_visualizer.db` | SQLite path; relative values are resolved from repo root by `scripts/dev.sh` |
| `CORS_ORIGINS` | Backend | Derived from frontend host/port | Comma-separated allowed origins |
| `CORS_ORIGIN_REGEX` | Backend | unset | Optional regex for dynamic origins (for example Vercel previews) |
| `FRONTEND_URL` | Backend | unset | Optional single frontend origin appended to CORS list |
| `BACKEND_HOST` | Dev runner | `127.0.0.1` | Host for Uvicorn bind |
| `BACKEND_PORT` | Dev runner | `8000` | Port for Uvicorn bind |
| `FRONTEND_HOST` | Dev runner | `127.0.0.1` | Host for Next.js dev server |
| `FRONTEND_PORT` | Dev runner | `3000` | Port for Next.js dev server |

Example custom run:

```bash
BACKEND_PORT=8010 FRONTEND_PORT=3010 NEXT_PUBLIC_API_URL=http://127.0.0.1:8010/api/v1 make dev
```

## Troubleshooting

- `Backend port ... is already in use`: stop old process or run with `BACKEND_PORT=<new-port>`.
- `Frontend port ... is already in use`: stop old process or run with `FRONTEND_PORT=<new-port>`.
- Frontend calls wrong backend: set `NEXT_PUBLIC_API_URL` and restart `make dev`.
- Artifacts not written where expected: set `RLV_RUNS_DIR`, then run `make dev-check`.
- DB path not applied as expected: set `RLV_DB_PATH`, then run `make dev-check`.
- Browser CORS failures in production: verify `CORS_ORIGINS` matches your Vercel domain.
- Validate setup without launching servers: `make dev-check`.

## Documentation map

- `errors.md` — root causes and latest working fixes (read before flow changes).
- `docs/prompt-18-analysis-and-tests.md` — background queue worker design + edge-case coverage.
- `docs/prompt-19-analysis-and-tests.md` — deployment integration notes + verification checklist.
- `docs/deployment.md` — production deployment for Vercel + Fly.io.
- `docs/assets/frontend-design-reference.png` — latest UI sample.

## Roadmap status

Prompts 01–19 in `roadmap.md` are executed.

## License

MIT
