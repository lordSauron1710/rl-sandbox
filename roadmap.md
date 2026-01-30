# RL Gym Visualizer - Development Roadmap

======================================================================

## Phase 0 — Repo + contracts

======================================================================

---

### Prompt 01 — Monorepo scaffold
// EXECUTED

Create a monorepo scaffold for an RL Gym Visualizer v0.

**Requirements:**
- /backend (FastAPI)
- /frontend (Next.js + TS)
- /docs
- root README with run instructions

**Include:**
- package manager choice for frontend (npm preferred)
- python packaging for backend (pyproject or requirements.txt)
- .gitignore for python/node artifacts
- scripts for dev startup

Return the full folder tree and the minimal files to boot both services.

---

### Prompt 02 — Define run storage layout + SQLite schema
// EXECUTED

Design the run storage layout and SQLite schema for experiments.

**Constraints:**
- Store metadata in SQLite
- Store artifacts on disk under runs/<run_id>/
- Metrics are append-only JSONL
- Evaluation produces MP4 files, keep only latest K=3 by default
- Event log stored for each run

**Output:**
- SQLite tables with columns + indexes:
  - runs (id, env_id, algorithm, status, config_json, created_at, updated_at)
  - events (id, run_id, timestamp, event_type, message)
- On-disk folder layout
- Example run config JSON (learning_rate, total_timesteps, seed)
- Example metrics JSONL line formats (episode, reward, length, loss, fps, timestamp)
- Example event types (training_started, checkpoint_saved, evaluation_started, warning, error)

---

### Prompt 03 — API contract (REST + SSE)
// EXECUTED

Define the minimal backend API contract for v0 using REST + SSE.

**Must include:**
- list environments (with metadata: id, name, action_space_type, obs_space_dims)
- create run (env_id, algorithm, learning_rate, total_timesteps)
- start training
- stop training
- get run detail
- list runs
- stream metrics via SSE (reward, episode_length, loss, fps, episode_count)
- trigger evaluation (test mode)
- stream live render frames (for Live Feed)
- fetch latest evaluation video URL
- fetch run artifacts (config/metrics)
- list events (for Event Log)

**Output:**
- Endpoint list with method, path, request body, response shape
- SSE event formats (metrics, frames, events)
- Error codes and status transitions
- WebSocket option for live frame streaming if SSE insufficient

======================================================================

## Phase 1 — Backend core

======================================================================

---

### Prompt 04 — FastAPI backend skeleton
// EXECUTED

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
// EXECUTED

Implement an in-process training runner for Stable-Baselines3.

**Constraints:**
- Supported environments:
  - LunarLander-v2 (DISCRETE, BOX(8))
  - CartPole-v1 (DISCRETE, BOX(4))
  - BipedalWalker-v3 (CONTINUOUS, BOX(24))
- Algorithms: PPO and DQN (DQN only for discrete envs)
- Must be interruptible via stop endpoint
- Must write metrics to JSONL as training progresses (reward, episode length, loss, fps)
- Must update run status in SQLite
- Must support configurable hyperparameters (learning_rate, total_timesteps)

**Output:**
- Training runner module
- start/stop endpoints wired to runner
- metrics writing format documented
- environment registry with metadata (action space type, obs space dims)
- ensure API stays responsive while training runs (thread or async safe approach)

---

### Prompt 06 — Metrics streaming (SSE) + Live frames
// EXECUTED

Implement SSE metrics streaming and optional live frame streaming for a run.

**Requirements:**
- Metrics endpoint: /runs/{id}/stream
  - Stream new metrics lines as they are appended
  - Payload: episode, reward, episode_length, loss, fps, timestamp
  - Throttle: max 4 updates per second
  - Client reconnect should resume from last event id or timestamp if provided
- Frames endpoint: /runs/{id}/frames (WebSocket recommended)
  - Stream rendered environment frames during training (optional, can be disabled)
  - Target: 10-15 fps during training (lower than eval to save resources)
  - Frame format: base64 JPEG or PNG
- Events endpoint: /runs/{id}/events
  - Stream event log entries in real-time

**Output:**
- SSE implementation for metrics
- WebSocket implementation for frames (or SSE with base64)
- event payload schemas
- example curl/wscat usage

---

### Prompt 07 — Evaluation recorder (MP4) + Live frame streaming
// NOT STARTED

Implement evaluation for a trained policy with live visualization support.

**Requirements:**
- Endpoint to trigger eval on-demand (TEST button)
- Runs N=5 or N=10 episodes (configurable)
- Records an MP4 (<=720p) using Gymnasium RecordVideo wrapper or equivalent
- Save under runs/<id>/eval/eval_<timestamp>.mp4
- Retain only latest K=3 eval videos, delete older
- Store eval summary JSON (return mean, length mean, termination stats)
- Stream live render frames during eval for Live Feed display:
  - WebSocket or base64-encoded frames via SSE
  - Target: 15-30 fps for smooth visualization
  - Include current episode + reward in frame metadata

**Output:**
- eval module
- endpoints
- artifact retention logic
- summary JSON schema
- live frame streaming implementation

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

**Reference Design:** See `docs/assets/frontend-design-reference.png`

**Layout:** Single-page 3-column dashboard
- Left sidebar: Environment select + Hyperparameters
- Center panel: Live feed + Metrics + Reward history
- Right sidebar: Analysis & Explainer + Event log

**Design System:**
- Light/white background, dark text
- Monospace/tech font for headers ("RL LAB // GYM MANAGER")
- Minimal borders, card-based components
- Red accent for warnings
- Version indicator in header (e.g., "V2.4.0")

---

### Prompt 09 — Next.js scaffold + 3-column layout shell
// NOT STARTED

Create the Next.js frontend scaffold with the 3-column dashboard layout.

**Requirements:**
- Tailwind setup with custom design tokens
- Single-page dashboard layout:
  - Header: "RL LAB // GYM MANAGER" branding + version indicator
  - Left sidebar (fixed width ~250px)
  - Center panel (flexible, main content)
  - Right sidebar (fixed width ~300px)
- Mobile: Collapsible sidebars or stacked layout
- Monospace font for headers (e.g., JetBrains Mono or similar)

**Output:**
- frontend folder structure
- layout components (Header, LeftSidebar, CenterPanel, RightSidebar)
- responsive breakpoints defined
- placeholder content in each panel

---

### Prompt 10 — Left sidebar: Environment select + Hyperparameters
// NOT STARTED

Implement the left sidebar with environment selection and training configuration.

**Requirements:**
- Environment Select section:
  - List of environments as selectable cards
  - Each card shows: Name, ID badge, action space (DISCRETE/CONTINUOUS), observation space (BOX with dimensions)
  - Environments: LunarLander-v2, CartPole-v1, BipedalWalker-v3
  - Selected state styling
- Hyperparameters section:
  - Algorithm dropdown (PPO / DQN)
  - Learning Rate input (default: 0.0003)
  - Total Timesteps input (default: 1,000,000)
- Action buttons:
  - TRAIN button (primary, filled)
  - TEST button (secondary, outlined)

**Output:**
- EnvironmentCard component
- HyperparametersForm component
- Form state management
- API integration for starting training/testing

---

### Prompt 11 — Center panel: Live feed + Metrics + Reward history
// NOT STARTED

Implement the center panel with live visualization and training metrics.

**Requirements:**
- Header row: "LIVE FEED" label + RECORD and RESET buttons
- Status badges: Episode count, Current reward (with +/- sign)
- Live visualization area:
  - Display environment render (video/canvas from backend stream)
  - Dark background for contrast
- Metrics row (4 cards):
  - Mean Reward
  - Eps Length (episode length)
  - Loss
  - FPS
- Reward History chart:
  - "REWARD HISTORY (LAST 100)" label
  - Bar chart showing episode rewards
  - Lightweight chart library (e.g., lightweight-charts or custom canvas)

**Output:**
- LiveFeed component with video/stream display
- MetricsRow component
- RewardHistoryChart component
- SSE client for real-time updates

---

### Prompt 12 — Right sidebar: Analysis & Explainer + Event log
// NOT STARTED

Implement the right sidebar with AI analysis and event logging.

**Requirements:**
- Analysis & Explainer section:
  - "POLICY BEHAVIOR DETECTED" header
  - Dynamic insight text based on training state
  - Examples: convergence detection, variance analysis, reward shaping suggestions
  - "GENERATE REPORT" button
- Event Log section:
  - "EVENT LOG" header
  - Timestamped event entries (HH:MM format)
  - Event types: checkpoint saved, evaluation started, warnings (in red), training started, environment initialized
  - Scrollable list, newest at top

**Output:**
- AnalysisPanel component
- EventLog component
- Event state management
- Mock insights for v0 (real AI analysis can come later)

---

### Prompt 13 — Evaluation playback integration
// NOT STARTED

Integrate evaluation playback into the Live Feed panel.

**Requirements:**
- TEST button triggers evaluation run
- Live Feed switches to show evaluation video
- Status badges update to show eval episode/reward
- Event log shows "Evaluation started: N episodes"
- After eval completes:
  - Display recorded MP4 in Live Feed area
  - Update metrics with eval summary
  - Log "Evaluation complete" event

**Output:**
- Eval state management
- Video player integration
- Seamless transition between training and eval views

---

### Prompt 14 — Analysis insights engine (v0)
// NOT STARTED

Implement basic analysis insights for the Analysis & Explainer panel.

**Requirements:**
- Rule-based insights (not AI for v0):
  - Convergence detection: "Agent has converged on a stable strategy"
  - Variance tracking: "Variance reduced by X% over last N episodes"
  - Reward shaping hints: "Consider adjusting [hyperparameter]"
  - Failure detection: "Training may be stuck, try different learning rate"
- Insight updates based on metrics stream
- Generate Report: Export current metrics + insights as JSON/text

**Output:**
- InsightsEngine service
- Insight templates
- Report generation utility

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
