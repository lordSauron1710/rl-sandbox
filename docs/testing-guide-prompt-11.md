# Testing Guide — Prompt 11 (Center Panel + Backend)

This guide explains how to run the app and what each control does after the Prompt 11 implementation (Live Feed, Metrics, Reward History, Environment Preview, SSE/WebSocket streaming).

---

## How to run backend and frontend

### 1. Start the backend

From the project root:

```bash
make backend
```

Or manually:

```bash
cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

- Backend: **http://localhost:8000**
- API base: **http://localhost:8000/api/v1**
- Health: **http://localhost:8000/health**
- API docs: **http://localhost:8000/docs**

### 2. Start the frontend

In another terminal:

```bash
make frontend
```

Or:

```bash
cd frontend && npm run dev
```

- Frontend: **http://localhost:3000**

### 3. One command (both in parallel)

```bash
make dev
```

---

## What works (buttons and behavior)

| Control | Where | What it does |
|--------|--------|---------------|
| **Environment cards** | Left sidebar | Select environment (e.g. LunarLander-v3, CartPole-v1, BipedalWalker-v3). Center panel shows a **preview** image from `GET /environments/{id}/preview` when one is selected and you’re not training/testing. |
| **TRAIN** | Left sidebar | Creates a run (POST /runs), starts training (POST /runs/{id}/start). Center panel connects to **SSE** (`/runs/{id}/stream/metrics`) and **WebSocket** (`/runs/{id}/ws/frames`). You see live metrics (Mean Reward, Eps Length, Loss, FPS), reward history chart, and live frames in the center. |
| **STOP** | Left sidebar | Visible **as its own red button** whenever training is running (replaces TRAIN). No hover needed. Calls POST /runs/{id}/stop to stop training. |
| **TEST** | Left sidebar | Starts evaluation (POST /runs/{id}/evaluate). **Only works if you have a run** (after at least one TRAIN). If no run exists, you get “No trained model available”. Runs 10 episodes by default; streams frames if backend supports it. |
| **Record** | Center panel (LIVE FEED header) | UI-only toggle: shows “Stop Rec” when on. Does **not** call the backend; it’s for future recording. |
| **Reset** | Center panel | Clears local metrics display, reward history, analysis insight, and disconnects SSE/WebSocket. Does **not** delete the run or stop training; if training is still running, streams may reconnect. |
| **GENERATE REPORT** | Right sidebar | Placeholder: adds an event to the log; no real report yet. |

---

## What does *not* work or is limited

1. **TEST without training**  
   TEST is enabled whenever an environment is selected and no operation is in progress, but the handler requires a `currentRun`. If you never clicked TRAIN (or cleared run state), clicking TEST shows “No trained model available”.

2. **Stop evaluation**  
   There is no “Stop evaluation” button in the UI. The backend supports `POST /runs/{id}/evaluate/stop`, but the frontend doesn’t call it yet.

3. **Backend crash on some environment previews**  
   On some systems (e.g. macOS with certain SDL/OpenGL setups), calling the **preview** endpoint for multiple environments in a row can crash the backend (exit 134). If that happens, restart the backend and try with a single environment (e.g. LunarLander-v3) first.

4. **Record**  
   Record is visual only; no backend recording or download yet.

---

## Quick backend check (without UI)

With the backend running:

```bash
# Health
curl -s http://localhost:8000/health

# List environments
curl -s http://localhost:8000/api/v1/environments | jq .

# Preview one env (may be slow or crash on some envs)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/environments/LunarLander-v3/preview

# Create run
curl -s -X POST http://localhost:8000/api/v1/runs \
  -H "Content-Type: application/json" \
  -d '{"env_id":"CartPole-v1","algorithm":"PPO","hyperparameters":{"learning_rate":0.0003,"total_timesteps":10000}}' | jq .

# Then start training (use run id from above)
curl -s -X POST http://localhost:8000/api/v1/runs/<RUN_ID>/start | jq .
```

---

## Fixes applied for Prompt 11

- **Evaluation API**: Frontend now sends `num_episodes`, `stream_frames`, and `target_fps` in the evaluate request body to match the backend `EvaluationRequest` schema (replacing the old `n_episodes` / `render`).
- **Integration test script**: `test-comprehensive.sh` was updated to use the same evaluate payload so backend tests align with the API.
