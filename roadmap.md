# RL Gym Visualizer - Development Roadmap

======================================================================

## Phase 0 — Repo + contracts

======================================================================

---

### Prompt 01 — Monorepo scaffold
// NOT STARTED

Create a monorepo scaffold for an RL Gym Visualizer v0.

**Requirements:**
- /backend (FastAPI)
- /frontend (Next.js + TS)
- /docs
- root README with run instructions

**Include:**
- package manager choice for frontend (pnpm preferred)
- python packaging for backend (pyproject or requirements.txt)
- .gitignore for python/node artifacts
- scripts for dev startup

Return the full folder tree and the minimal files to boot both services.

---

### Prompt 02 — Define run storage layout + SQLite schema
// NOT STARTED

Design the run storage layout and SQLite schema for experiments.

**Constraints:**
- Store metadata in SQLite
- Store artifacts on disk under runs/<run_id>/
- Metrics are append-only JSONL
- Evaluation produces MP4 files, keep only latest K=3 by default

**Output:**
- SQLite tables with columns + indexes
- On-disk folder layout
- Example run config JSON
- Example metrics JSONL line formats

---

### Prompt 03 — API contract (REST + SSE)
// NOT STARTED

Define the minimal backend API contract for v0 using REST + SSE.

**Must include:**
- create run
- start training
- stop training
- get run detail
- list runs
- stream metrics via SSE
- trigger evaluation
- fetch latest evaluation video URL
- fetch run artifacts (config/metrics)

**Output:**
- Endpoint list with method, path, request body, response shape
- SSE event formats
- Error codes and status transitions

======================================================================

## Phase 1 — Backend core

======================================================================

---

### Prompt 04 — FastAPI backend skeleton
// NOT STARTED

Implement the FastAPI backend skeleton.

**Requirements:**
- app startup creates SQLite DB if missing
- health endpoint
- models for Run + status enum
- create/list/get run endpoints implemented (no training yet)

**Output:**
- backend code files with clear module structure
- minimal DB access layer
- instructions to run backend locally

---

### Prompt 05 — Training runner (in-process, interruptible)
// NOT STARTED

Implement an in-process training runner for Stable-Baselines3.

**Constraints:**
- Only CartPole-v1
- Algorithms: PPO and DQN
- Must be interruptible via stop endpoint
- Must write metrics to JSONL as training progresses
- Must update run status in SQLite

**Output:**
- Training runner module
- start/stop endpoints wired to runner
- metrics writing format documented
- ensure API stays responsive while training runs (thread or async safe approach)

---

### Prompt 06 — Metrics streaming (SSE)
// NOT STARTED

Implement SSE metrics streaming for a run.

**Requirements:**
- Endpoint: /runs/{id}/stream
- Stream new metrics lines as they are appended
- Throttle: max 4 updates per second
- Client reconnect should resume from last event id or timestamp if provided

**Output:**
- SSE implementation
- event payload schema
- example curl usage

---

### Prompt 07 — Evaluation recorder (MP4)
// NOT STARTED

Implement evaluation for a trained policy.

**Requirements:**
- Endpoint to trigger eval on-demand
- Runs N=5 episodes by default
- Records an MP4 (<=720p) using Gymnasium RecordVideo wrapper or equivalent
- Save under runs/<id>/eval/eval_<timestamp>.mp4
- Retain only latest K=3 eval videos, delete older
- Store eval summary JSON (return mean, length mean, termination stats)

**Output:**
- eval module
- endpoints
- artifact retention logic
- summary JSON schema

---

### Prompt 08 — Artifact endpoints + static file serving
// NOT STARTED

Add endpoints to retrieve artifacts and serve eval MP4s.

**Requirements:**
- GET run config
- GET metrics (optionally tail last N lines)
- GET latest eval summary
- Serve MP4 via a static route with correct headers
- Ensure path traversal safety

**Output:**
- endpoints implemented
- secure file handling approach

======================================================================

## Phase 2 — Frontend core (responsive + lightweight)

======================================================================

---

### Prompt 09 — Next.js scaffold + design system
// NOT STARTED

Create the Next.js frontend scaffold.

**Requirements:**
- Tailwind setup
- Basic layout shell (header, sidebar on desktop, bottom nav or drawer on mobile)
- Pages: Home (runs list + new run), Run detail dashboard, Compare, Explain
- Minimal component library approach (no heavy dependencies)

**Output:**
- frontend folder structure
- routing plan
- responsive layout implemented with placeholder content

---

### Prompt 10 — Runs list + create run UI
// NOT STARTED

Implement Home page.

**Requirements:**
- List runs from backend
- Create run form:
  - algo select: PPO/DQN
  - preset select: Fast/Stable/High Score (maps to configs)
  - seed input
  - total timesteps input (bounded)
- Start button triggers run creation + start training, then navigates to run page

**Output:**
- UI components
- API client layer
- form validation + loading states

---

### Prompt 11 — Run dashboard charts + live stream
// NOT STARTED

Implement Run dashboard.

**Requirements:**
- Show status, elapsed time, stop button
- Live charts fed by SSE:
  - Reward curve
  - Episode length curve
  - DQN: epsilon, loss
  - PPO: entropy, approx_kl (or clip_fraction)
- Charts must be lightweight and update smoothly
- Mobile layout: charts stacked, playback below

**Output:**
- SSE client implementation
- chart components
- throttled updates on UI side too

---

### Prompt 12 — Eval playback card
// NOT STARTED

Implement evaluation playback.

**Requirements:**
- "Run Evaluation" button
- Show latest eval MP4 in a responsive video player
- Show eval summary card (mean return, mean length, timestamp)
- Handle states: no eval yet, eval running, eval failed

**Output:**
- components + API wiring
- clean responsive playback UX

---

### Prompt 13 — Compare view (v0-lite)
// NOT STARTED

Implement Compare view for 2 runs.

**Requirements:**
- Select two completed runs
- Overlay reward curves
- Metrics table:
  - best moving average return
  - time-to-threshold (e.g., return >= 450)
  - stability: std over last 20 episodes
- Works on mobile (stacked)

**Output:**
- compare page + utilities to compute derived metrics

---

### Prompt 14 — Explain pages (DQN + PPO)
// NOT STARTED

Implement Explain section.

**Requirements:**
- Two pages: DQN and PPO
- Short, skimmable sections:
  - What it optimizes
  - What data it learns from
  - Key knobs (mapped to presets)
  - Common failure modes
- Optional: show run-specific hints if a run is selected

**Output:**
- markdown or component-based explainers
- lightweight styling

======================================================================

## Phase 3 — Polish + guardrails

======================================================================

---

### Prompt 15 — Presets mapping + bounds
// NOT STARTED

Finalize preset configurations and safety bounds.

**Requirements:**
- Presets: Fast / Stable / High Score for each algo
- Bounds on timesteps, batch sizes, buffer sizes
- Config schema validated server-side
- Return config on run detail for UI display

**Output:**
- preset tables
- validation logic
- docs update

---

### Prompt 16 — QA checklist + acceptance tests
// NOT STARTED

Create an acceptance test checklist for v0.

**Include:**
- Functional flows
- Responsiveness checks (mobile widths)
- Performance checks (SSE throttling, chart updates)
- Failure modes (stop training, restart backend, missing artifacts)

**Output:**
- docs/qa.md
- recommended manual test steps

---

### Prompt 17 — Packaging + one-command dev
// NOT STARTED

Improve dev experience.

**Requirements:**
- One command to start backend + frontend (makefile or scripts)
- Clear env vars (backend URL, runs dir)
- README updated with setup steps and troubleshooting

**Output:**
- scripts
- updated README

---

### Prompt 18 — Optional: background worker (only if needed)
// NOT STARTED

If in-process training causes responsiveness issues, migrate training/eval to a background worker.

**Constraints:**
- Keep dependencies minimal
- No external services
- Use a local queue approach (multiprocessing + SQLite job table)

**Output:**
- worker design
- implementation steps
- minimal code changes required
