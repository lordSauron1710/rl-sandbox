# RL Gym Visualizer - Development Roadmap

---

## Prompt 1: Product framing

You are a senior product engineer.

Lock a v0 MVP product spec for an RL Gym visualizer webapp.

**Constraints:**
- Responsive
- Lightweight
- Single environment and two algorithms
- Server-side rendering (recorded video/frames)
- Focus on clarity, not feature breadth

**Output:**
- Product goal
- In-scope vs out-of-scope
- Target user

---

## Prompt 2: User flows

Define the core user flows for the v0 RL Gym visualizer.

**Include:**
- Train flow
- Test / evaluation flow
- Playback flow
- Algorithm explanation flow

Keep it minimal and realistic for an MVP.

---

## Prompt 3: Architecture overview

Design a lightweight system architecture for the RL Gym visualizer.

**Constraints:**
- Python-based RL backend
- Web frontend
- No cloud or auth for v0

**Output:**
- Backend components
- Frontend components
- How they communicate
- Where training runs live

---

## Prompt 4: Backend tech stack + responsibilities

Design the backend for the RL Gym visualizer v0.

**Constraints:**
- Python
- Gymnasium
- Stable-Baselines3
- FastAPI

**Output:**
- Core services/modules
- Training lifecycle
- Evaluation lifecycle
- Artifact handling (models, metrics, videos)

---

## Prompt 5: Data model

Define the data model for experiments/runs in the RL Gym visualizer.

**Include:**
- Run metadata
- Config schema
- Metrics format
- Evaluation artifacts
- Storage layout on disk

Assume SQLite or simple local persistence.

---

## Prompt 6: Frontend layout and responsiveness

Design the frontend layout for the RL Gym visualizer.

**Constraints:**
- Responsive (mobile + desktop)
- Lightweight UI
- No heavy visual effects

**Output:**
- Screens/pages
- Layout per screen
- Mobile vs desktop behavior

---

## Prompt 7: Training dashboard details

Specify the training dashboard UI.

**Include:**
- Metrics to show for DQN
- Metrics to show for PPO
- Update frequency
- How to avoid overwhelming the user

Focus on clarity and performance.

---

## Prompt 8: Evaluation & playback UX

Design the evaluation and playback experience.

**Constraints:**
- Server-side recorded video or frames
- Lightweight and responsive

**Include:**
- When evaluations run
- What the user sees
- Scrubbing and inspection features
- What metadata is shown alongside playback

---

## Prompt 9: Algorithm explainer content

Create the structure for algorithm explainer pages.

**Algorithms:**
- DQN
- PPO

**For each include:**
- What it optimizes
- What data it learns from
- Key hyperparameters
- Common failure modes

Keep explanations short and intuitive.

---

## Prompt 10: API surface

Design the minimal API for the RL Gym visualizer backend.

**Include:**
- Run creation
- Start/stop training
- Metrics streaming
- Evaluation trigger
- Artifact retrieval

Use REST + WebSocket or SSE.

---

## Prompt 11: Performance constraints

Define performance and resource constraints for v0.

**Include:**
- Training limits
- Video quality limits
- Disk usage bounds
- UI update throttling

Assume this runs on a single developer machine.

---

## Prompt 12: Acceptance criteria

Write clear acceptance criteria for the RL Gym visualizer v0.

**Include:**
- Functional checks
- UX checks
- Performance checks

Make it testable.

---

## Prompt 13: Build order (execution plan)

Create a step-by-step build plan for implementing the RL Gym visualizer v0.

Order tasks to minimize rework.
Assume solo developer.
