# AGENTS.md

This file provides guidance for AI agents working in this repository.

## Project Overview

This repository contains the development of an **RL Gym Visualizer** - a lightweight web application for visualizing reinforcement learning training and evaluation using Gymnasium and Stable-Baselines3.

## Deployment Target

**Goal:** Lightweight webapp deployable to Vercel (frontend) with a separate backend.

### Architecture for Deployment

```
┌─────────────────┐         ┌─────────────────────────┐
│   Vercel        │         │   Fly.io                │
│   (Frontend)    │ ◄─────► │   (Backend)             │
│                 │   API   │                         │
│   Next.js       │   SSE   │   FastAPI + Gymnasium   │
│   Static/SSR    │   WS    │   + Stable-Baselines3   │
└─────────────────┘         └─────────────────────────┘
```

**Why split deployment?**
- Vercel serverless functions have 10-60s timeout limits
- RL training runs for minutes/hours (not compatible with serverless)
- Backend requires heavy compute (PyTorch, Gymnasium rendering)
- Frontend is static/SSR and deploys perfectly on Vercel

**Chosen hosting:**
- **Frontend:** Vercel (free tier)
- **Backend:** Fly.io (free tier - 3 shared CPUs, persistent processes, WebSocket support)

### Key Architectural Decisions

1. **Frontend must work independently** - Handle API unavailability gracefully with fallbacks
2. **API URL must be configurable** - Use `NEXT_PUBLIC_API_URL` environment variable
3. **CORS must be configured** - Backend allows requests from Vercel frontend domain
4. **Keep frontend bundle small** - No heavy dependencies in Next.js
5. **SSE/WebSocket for real-time** - Streaming metrics and frames from backend

## Key Files

- `roadmap.md` - Contains the development prompts for building the v0 MVP
- `README.md` - Project documentation

## Prompt Execution Tracking

When executing prompts from `roadmap.md`:

1. **Add a status tag** at the top of each prompt block (immediately after the `## Prompt X:` header):
   - `// IN PROGRESS` - When starting work on a prompt
   - `// EXECUTED` - When work on a prompt is complete

2. **Update the tag immediately** when work starts or finishes

3. **Keep the prompt text unchanged** below the tag

### Example

Before:
```markdown
## Prompt 1: Product framing

You are a senior product engineer.
...
```

During execution:
```markdown
## Prompt 1: Product framing
// IN PROGRESS

You are a senior product engineer.
...
```

After completion:
```markdown
## Prompt 1: Product framing
// EXECUTED

You are a senior product engineer.
...
```

## Tech Stack (v0)

- **Backend:** Python, FastAPI, Gymnasium, Stable-Baselines3
- **Frontend:** Next.js, TypeScript, Tailwind CSS
- **Storage:** SQLite + local file persistence
- **Environments:** LunarLander-v2, CartPole-v1, BipedalWalker-v3
- **Algorithms:** DQN (discrete only), PPO (all)

## Design Reference

See `docs/assets/frontend-design-reference.png` for the target UI design.

**Layout:** Single-page 3-column dashboard
- Left sidebar: Environment select + Hyperparameters + Train/Test buttons
- Center panel: Live Feed + Metrics (Mean Reward, Eps Length, Loss, FPS) + Reward History chart
- Right sidebar: Analysis & Explainer + Event Log

## Development Principles

- Focus on clarity over feature breadth
- Keep the implementation lightweight and deployable
- **Frontend:** Optimized for Vercel (small bundle, static where possible)
- **Backend:** Stateless API design (no server-side sessions)
- Server-side streaming for video/frames (SSE + WebSocket)
- No authentication for v0
- Environment variables for all configuration (API URLs, etc.)
- Graceful degradation when backend is unavailable
