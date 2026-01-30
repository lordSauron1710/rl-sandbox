# RL/Gym Visualizer

A lightweight web application for visualizing reinforcement learning training and evaluation.

![Frontend Screenshot](docs/assets/frontend-screenshot.png)

## Features

- **3 Environments:** LunarLander-v3, CartPole-v1, BipedalWalker-v3
- **Algorithms:** PPO (all envs) and DQN (discrete action spaces only)
- **Real-time training:** Live metrics streaming via SSE, frame streaming via WebSocket
- **Evaluation:** Record and playback evaluation videos (MP4)
- **Modern UI:** Responsive 3-column dashboard with environment selection, hyperparameters, and live visualization

## Project Structure

```
rl-sandbox/
├── backend/                        # FastAPI backend
│   ├── app/
│   │   ├── db/                     # Database layer
│   │   │   ├── database.py         # SQLite connection
│   │   │   ├── schema.sql          # DB schema
│   │   │   ├── runs_repository.py
│   │   │   └── events_repository.py
│   │   ├── models/                 # Pydantic models
│   │   │   ├── environment.py      # Environment registry
│   │   │   ├── event.py
│   │   │   └── run.py
│   │   ├── routers/                # API endpoints
│   │   │   ├── environments.py
│   │   │   └── runs.py
│   │   ├── storage/                # File storage
│   │   │   └── run_storage.py
│   │   ├── streaming/              # SSE & WebSocket
│   │   │   ├── pubsub.py
│   │   │   └── router.py
│   │   ├── training/               # Training runner
│   │   │   ├── callback.py
│   │   │   ├── evaluator.py
│   │   │   ├── manager.py
│   │   │   └── runner.py
│   │   └── main.py
│   ├── data/                       # SQLite database (created on startup)
│   ├── runs/                       # Run artifacts (created per run)
│   └── requirements.txt
├── frontend/                       # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Main dashboard page
│   │   │   └── globals.css         # Global styles + design tokens
│   │   ├── components/
│   │   │   ├── Header.tsx          # App header with branding
│   │   │   ├── LeftSidebar.tsx     # Env select + hyperparameters + TRAIN/STOP/TEST
│   │   │   ├── CenterPanel.tsx     # Live feed + metrics + reward chart
│   │   │   ├── LiveFeed.tsx        # Live stream / env preview (idle)
│   │   │   ├── RightSidebar.tsx    # Analysis + event log
│   │   │   ├── EnvironmentCard.tsx # Selectable environment card
│   │   │   ├── HyperparametersForm.tsx # Training config form
│   │   │   ├── LoadingButton.tsx   # Button with spinner
│   │   │   └── index.ts            # Component exports
│   │   ├── hooks/
│   │   │   ├── useEnvironments.ts  # Fetch environments from API
│   │   │   ├── useTraining.ts      # Training state management
│   │   │   ├── useMetricsStream.ts # SSE metrics stream
│   │   │   ├── useLiveFrames.ts    # WebSocket frame stream
│   │   │   └── index.ts
│   │   └── services/
│   │       └── api.ts              # Type-safe API client
│   ├── package.json
│   └── tailwind.config.ts
├── docs/                           # Documentation
│   ├── api-contract.md             # Full API specification
│   ├── data-model.md               # Data model docs
│   ├── prompt-11-analysis-and-tests.md  # Prompt 11 analysis & test guide
│   ├── testing-guide-prompt-11.md  # Button/control behavior (Prompt 11)
│   └── assets/
│       ├── frontend-design-reference.png
│       └── frontend-screenshot.png
├── Makefile                        # Dev scripts (backend, frontend, test-smoke, test)
├── test-smoke.sh                   # Minimal backend smoke test for CI
├── test-comprehensive.sh            # Full backend test (envs, lifecycle, eval)
├── roadmap.md                      # Development prompts
└── README.md
```

## Supported Environments

| Environment | Action Space | Obs Space | Algorithms |
|-------------|--------------|-----------|------------|
| LunarLander-v3 | Discrete (4) | Box(8) | PPO, DQN |
| CartPole-v1 | Discrete (2) | Box(4) | PPO, DQN |
| BipedalWalker-v3 | Continuous (4) | Box(24) | PPO only |

(Environments use v3 where Gymnasium 1.0+ deprecated v2.)

## UI Design

The frontend uses a **responsive 3-column dashboard layout**:
- **Left sidebar:** Environment selection cards + Hyperparameters form (algorithm, learning rate, timesteps)
- **Center panel:** Live feed visualization + Metrics (Mean Reward, Episode Length, Loss, FPS) + Reward history chart
- **Right sidebar:** Analysis & Explainer + Event log

On mobile, sidebars stack vertically for responsive viewing.

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm

## Quick Start

### 1. Install Dependencies

```bash
# Install all dependencies
make install
```

Or install separately:

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### 2. Start Development Servers

```bash
# Start both servers
make dev
```

Or start separately:

```bash
# Terminal 1 - Backend
make backend
# Or: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2 - Frontend
make frontend
# Or: cd frontend && npm run dev
```

### 3. Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### 4. Run Tests (backend must be running)

```bash
# Minimal smoke test (CI-friendly: health, envs, create/start/stop run)
make test-smoke

# Full test (environments, lifecycle, evaluation, error handling)
make test
```

## API Endpoints

Base URL: `http://localhost:8000/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (at origin, not under `/api/v1`) |
| `/environments` | GET | List supported environments |
| `/environments/{id}/preview` | GET | Single JPEG preview frame (idle state) |
| `/runs` | GET | List all runs |
| `/runs` | POST | Create a new run |
| `/runs/{id}` | GET | Get run details |
| `/runs/{id}/start` | POST | Start training |
| `/runs/{id}/stop` | POST | Stop training |
| `/runs/{id}/evaluate` | POST | Start evaluation (num_episodes, stream_frames, target_fps) |
| `/runs/{id}/events` | GET | List run events |
| `/runs/{id}/stream/metrics` | GET | SSE metrics stream |
| `/runs/{id}/ws/frames` | WS | WebSocket frame stream |

See [docs/api-contract.md](./docs/api-contract.md) for full API documentation. See [docs/testing-guide-prompt-11.md](./docs/testing-guide-prompt-11.md) for button/control behavior and [docs/prompt-11-analysis-and-tests.md](./docs/prompt-11-analysis-and-tests.md) for Prompt 11 analysis and test instructions.

## Development

See [docs/README.md](./docs/README.md) for detailed documentation.

## License

MIT
