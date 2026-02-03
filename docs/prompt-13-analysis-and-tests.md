# Prompt 13 — Evaluation Playback Integration

**Branch:** `codex/playback-integration`  
**Date:** 2026-02-03  
**Status:** In progress during implementation, then marked executed in `roadmap.md`.

---

## 1) Prompt 13 Requirements vs Implementation

| Requirement | Implementation | Status |
|---|---|---|
| TEST button triggers evaluation run | `handleTest` calls `evaluate(DEFAULT_EVAL_EPISODES)` after stream pre-connect | ✅ |
| Live Feed switches to show evaluation video | `LiveFeed` supports post-eval `<video>` playback via `playbackVideoUrl` | ✅ |
| Status badges show eval episode/reward | Episode/reward now prefer live frame metadata + eval progress during evaluation; playback shows summary values | ✅ |
| Event log shows "Evaluation started: N episodes" | Local event added on evaluate start; backend emits `evaluation_started` with episode count | ✅ |
| After eval complete show MP4 | Transition watcher (`evaluating` -> terminal) fetches summary and resolves MP4 URL for playback | ✅ |
| After eval complete update metrics from summary | `setMetrics` with `mean_reward` and rounded `mean_length` from summary | ✅ |
| After eval complete log event | Local `evaluation_completed` event added with episode count and mean reward | ✅ |

---

## 2) Key Integration Notes

- Playback uses backend summary (`GET /runs/{id}/evaluate/latest`) and resolves `video_path` to absolute URL with cache-busting query.
- Live stream behavior from Prompt 11/`errors.md` is preserved:
  - Streams connect before evaluation starts.
  - WS/SSE are still best-effort and non-blocking for training start.
- Playback state is cleared when:
  - New training starts
  - A new evaluation starts
  - Global reset runs
- Stale summary guard: if summary timestamp predates current evaluation request, playback is not promoted.

---

## 3) Edge Cases Tested

### Automated

- `npm run build` (frontend) ✅
- `python3 -m compileall app` (backend) ✅
- `bash test-smoke.sh` ✅
- `bash test-comprehensive.sh` ✅ (27 passed, 0 failed)
  - Added checks for:
    - No pre-eval summary/video before TEST
    - Eval summary payload includes `num_episodes`, `mean_reward`, and `video_path`
    - Eval lifecycle events include both `evaluation_started` and `evaluation_completed`

### Additional manual API edge case

- **Early stop during evaluation**:
  - Start evaluation for 10 episodes, stop after ~1s.
  - Verified run returns to terminal state.
  - Verified summary exists and can include partial episode count.
  - Verified evaluation started/completed events are recorded.

---

## 4) State Coverage

- Environments exercised through existing comprehensive suite: `LunarLander-v3`, `CartPole-v1`, `BipedalWalker-v3`.
- UI states covered by implementation:
  - Idle preview
  - Training live stream
  - Evaluating live stream
  - Post-eval video playback
  - Reset and re-run transitions

