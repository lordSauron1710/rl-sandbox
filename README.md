# RL Sandbox (RL Gym Visualizer)

Lightweight RL training and evaluation visualizer with a Next.js dashboard and FastAPI backend.

[![CI](https://github.com/lordSauron1710/rl-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/lordSauron1710/rl-sandbox/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/lordSauron1710/rl-sandbox?style=flat)](https://github.com/lordSauron1710/rl-sandbox/stargazers)
[![Forks](https://img.shields.io/github/forks/lordSauron1710/rl-sandbox?style=flat)](https://github.com/lordSauron1710/rl-sandbox/network/members)
[![Issues](https://img.shields.io/github/issues/lordSauron1710/rl-sandbox)](https://github.com/lordSauron1710/rl-sandbox/issues)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

![RL Sandbox UI](docs/assets/frontend-design-reference.png)

## What it does

- Trains PPO and DQN agents on supported Gymnasium environments.
- Streams live metrics (SSE) and frames (WebSocket) to a single-page dashboard.
- Runs evaluation episodes, records MP4 artifacts, and serves latest results.
- Persists run metadata in SQLite and artifacts on disk.
- Supports production split deployment: Vercel frontend + Fly.io backend.

## Architecture

```text
Frontend (Next.js)  <---- REST / SSE / WS ---->  Backend (FastAPI + SB3 + Gymnasium)
Vercel                                       Fly.io (long-running worker + persistence)
```

## Supported environments and features

| Environment | Action Space | Observation Space | Algorithms |
|---|---|---|---|
| `LunarLander-v3` | Discrete (4) | Box(8) | PPO, DQN |
| `CartPole-v1` | Discrete (2) | Box(4) | PPO, DQN |
| `BipedalWalker-v3` | Continuous (4) | Box(24) | PPO |

## Repository subway map

```mermaid
flowchart LR
  root["rl-sandbox/"]

  root --> frontend["Frontend Line: frontend/"]
  root --> backend["Backend Line: backend/"]
  root --> docs["Docs Line: docs/"]
  root --> scripts["Ops Line: scripts/"]

  frontend --> f1["src/app (dashboard shell)"]
  frontend --> f2["src/components (UI panels)"]
  frontend --> f3["src/hooks (runtime streams/state)"]
  frontend --> f4["src/services (API client)"]

  backend --> b1["app/routers (REST routes)"]
  backend --> b2["app/training (runner + evaluator + queue)"]
  backend --> b3["app/streaming (SSE/WS pubsub)"]
  backend --> b4["app/db + app/storage (SQLite + artifacts)"]

  docs --> d1["deployment.md"]
  docs --> d2["assets/ (reference visuals)"]

  scripts --> s1["dev.sh (one-command local dev)"]
```

## Repository layout

```text
rl-sandbox/
├── backend/
│   ├── app/
│   │   ├── db/
│   │   ├── models/
│   │   ├── routers/
│   │   ├── storage/
│   │   ├── streaming/
│   │   └── training/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── services/
│   └── vercel.json
├── docs/
├── scripts/
├── fly.toml
├── roadmap.md
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm

## Quick start

```bash
cp .env.example .env
make dev
```

Local URLs:

- Frontend: `http://127.0.0.1:3000`
- Backend API: `http://127.0.0.1:8000/api/v1`
- Backend docs: `http://127.0.0.1:8000/docs`

Production deployment guide:

- `docs/deployment.md`

## Test commands

Backend should be running first.

```bash
make test-smoke
make test
```

## Key API routes

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Service health check |
| `/api/v1/environments` | GET | List supported environments |
| `/api/v1/runs` | POST | Create run |
| `/api/v1/runs/{id}/start` | POST | Start/queue training |
| `/api/v1/runs/{id}/stop` | POST | Stop training |
| `/api/v1/runs/{id}/evaluate` | POST | Start/queue evaluation |
| `/api/v1/runs/{id}/stream/metrics` | GET (SSE) | Stream live metrics |
| `/api/v1/runs/{id}/ws/frames` | WS | Stream live frames |
| `/api/v1/runs/{id}/artifacts/eval/latest.mp4` | GET | Fetch latest evaluation video |

## Environment variables

| Variable | Scope | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend | `http://127.0.0.1:8000/api/v1` | API base URL used by frontend |
| `RLV_RUNS_DIR` | Backend | `backend/runs` | Artifact storage root |
| `RLV_DB_PATH` | Backend | `backend/data/rl_visualizer.db` | SQLite database path |
| `CORS_ORIGINS` | Backend | local frontend origins | Comma-separated allowed origins |
| `CORS_ORIGIN_REGEX` | Backend | unset | Optional regex for preview domains |
| `FRONTEND_URL` | Backend | unset | Optional single frontend origin |
| `BACKEND_HOST` | Dev runner | `127.0.0.1` | Uvicorn host |
| `BACKEND_PORT` | Dev runner | `8000` | Uvicorn port |
| `FRONTEND_HOST` | Dev runner | `127.0.0.1` | Next.js host |
| `FRONTEND_PORT` | Dev runner | `3000` | Next.js port |

## Documentation map

- `docs/deployment.md`: production deployment on Vercel + Fly.io
- `errors.md`: latest known issues and fixes
- `roadmap.md`: implementation roadmap and prompt status

## Roadmap status

- Prompts 01-19 are marked executed in `roadmap.md`.

## License

MIT

## Star tracker

[![Star History Chart](https://api.star-history.com/svg?repos=lordSauron1710/rl-sandbox&type=Date)](https://star-history.com/#lordSauron1710/rl-sandbox&Date)
