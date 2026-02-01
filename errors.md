# Errors & Learnings Log

This file tracks errors encountered during development so we can avoid repeating them. Update it when you hit new issues or root-cause existing ones.

**Policy — latest working fix only:** We may attempt to solve a bug multiple times. This file records **only the latest method that works**. When you find a new fix that works, replace the existing Fix section with it; do not keep multiple attempts or outdated fixes. One entry = one current, working fix. Keep it consistent so the repo has a single source of truth for “how we fixed this.”

---

## 1. Real-time streaming & connection timing

### 1.1 Live feed blank during training (subscriber race)

**Symptom:** Live Feed panel showed black box + camera icon during training; metrics and episode/reward badges updated, “LIVE” green, but no environment video.

**Root cause:** (1) The backend frame callback skips rendering when `get_subscriber_count(run_id) == 0`. (2) We called `connectFrames(run.id)` in `onRunCreated` but did **not** wait for the WebSocket to open before calling `startTraining(run.id)`; the WebSocket connects asynchronously, so the training thread often started with 0 subscribers and skipped frames. (3) The stream-connection effect then ran and called `connectFrames` again, which called `disconnect()` first and closed the socket we had just opened.

**Fix (latest, working):**
1. **Wait for WebSocket open before starting training:** `connectFrames(runId, fps)` now returns a `Promise<void>` that resolves when `ws.onopen` fires. In `handleTrain`, pass `onRunCreated: async (run) => { connectMetrics(run.id); await connectFrames(run.id, 15) }`. In `useTraining`, `await Promise.resolve(options?.onRunCreated?.(run))` before calling `startTraining(run.id)`. So we only send `POST /runs/{id}/start` after the frames WebSocket is open and the backend has a subscriber.
2. **No double-connect:** In `useLiveFrames.connect()`, if we’re already connected for the same `runId` (`runIdRef.current === runId && ws.readyState === OPEN`), return `Promise.resolve()` without calling `disconnect()`. Then when the effect runs after `onRunCreated`, it won’t tear down the connection.
3. **Effect backup:** Keep the effect that connects when `status === 'pending' || 'training' || 'evaluating' || isStarting` so we still connect when run/status changes; the “already connected for same run” guard avoids disconnecting.

**Lesson:** For “subscribe then stream” backends, the client must have a **subscriber registered** before the producer starts. That means waiting for the WebSocket (or SSE) to be **open** before triggering training/evaluation, not just calling `connect()` and then starting in the same tick. Also avoid the effect re-calling `connect()` and disconnecting the socket you just opened—guard by “already connected for this run.”

---

### 1.2 Same issue during evaluation (Test)

**Symptom:** Live feed could stay blank when clicking Test after training.

**Root cause:** Same idea as 1.1: frontend connected in a `useEffect` when `status === 'evaluating'`, but evaluation starts as soon as the API is called. Subscriber count was 0 when the evaluator began streaming.

**Fix (latest, working):** In `handleTest`, call `connectMetrics(currentRun.id)` and `connectFrames(currentRun.id, 15)` **before** `evaluate(10)`. No status-based effect—connect imperatively so the evaluator has a subscriber when it starts streaming.

**Lesson:** Any flow that starts a server-side stream (training, evaluation, etc.) should connect the client **before** triggering that flow, not in response to a status change that happens after the trigger.

---

### 1.3 Effect cleanup causing brief disconnect

**Observation:** The stream connection effect had a cleanup that called `disconnectMetrics()` and `disconnectFrames()`. When deps changed (e.g. `pending` → `training`), React ran cleanup first, then the effect body. That created a short window with 0 subscribers right as training was starting.

**Fix (latest, working):** Do not rely on the effect alone for “connect before start.” Use explicit calls: (1) `onRunCreated` in `createAndStartTraining` so we connect right after run creation and before `startTraining`; (2) in `handleTest`, call `connectMetrics` and `connectFrames` before `evaluate(10)`. The effect still runs for connect/disconnect when run/status changes, but the critical “subscriber exists before producer starts” is guaranteed by these imperative calls.

**Lesson:** For critical ordering (e.g. “subscriber must exist before producer starts”), prefer explicit calls at the right moment over depending on effect run order and cleanup.

---

### 1.4 WebSocket connection error blocks training

**Symptom:** User sees "Error: WebSocket connection error" when clicking TRAIN; training never starts on any environment.

**Root cause:** We await `connectFrames(run.id, 15)` in `onRunCreated` before calling `startTraining`. If the frames WebSocket fails (backend unreachable, proxy blocks WS, wrong URL, etc.), the Promise rejects and `createAndStartTraining` throws, so we never call `startTraining`.

**Fix (latest, working):** Do **not** block training on the frames WebSocket. In `handleTrain`’s `onRunCreated`: wrap `await connectFrames(run.id, 15)` in `try/catch`; on failure, ignore and continue. Optionally race with an 8s timeout so we don’t hang when the backend is down. Training always starts; the live feed may show a placeholder if the WebSocket fails.

**Lesson:** Training must work even when the live feed stream is unavailable. Treat stream connection as best-effort: try to connect before starting so the feed works when possible, but never block starting training on stream success.

---

## 2. Backend: frame encoding & environment differences

### 2.1 Render output dtype (float vs uint8)

**Risk:** Training callback and evaluator used `Image.fromarray(frame)` assuming `frame` is uint8 (0–255). Some Gymnasium envs or wrappers can return float (0–1) or other dtypes; that can cause wrong colors, errors, or no frames.

**Fix (latest, working):** Normalize before encoding, in this order:
```python
if frame.dtype == np.floating:
    frame = (np.clip(frame, 0, 1) * 255).astype(np.uint8)
elif frame.dtype != np.uint8:
    frame = np.asarray(frame, dtype=np.uint8)
img = Image.fromarray(frame)
```
Then encode to JPEG as usual. Applied in `backend/app/training/callback.py` (`_maybe_stream_frame`) and `backend/app/training/evaluator.py` (`_render_and_stream_frame`).

**Lesson:** Don’t assume env `render()` return dtype. Normalize (float 0–1 → uint8 0–255, or cast to uint8) in one place so all envs (LunarLander, CartPole, BipedalWalker, etc.) work.

---

## 3. Frontend: state ownership & flow

### 3.1 Mutating state owned by another hook

**Mistake:** In an earlier fix attempt, the page called `setCurrentRun(run)` and then `connectFrames(run.id)` etc. from `handleTrain`. `currentRun` and `setCurrentRun` live inside `useTraining`, not in the page. The page doesn’t have `setCurrentRun`; only the hook does.

**Fix (latest, working):** Keep run state in the hook. Expose a callback: `createAndStartTraining(config, options?)` with `options.onRunCreated?: (run: ApiRun) => void`. The hook does: `createRun` → `setCurrentRun(run)` → `options?.onRunCreated?.(run)` → `startTraining(run.id)`. The page passes `onRunCreated: (run) => { connectMetrics(run.id); connectFrames(run.id, 15) }` so it can connect streams without ever calling `setCurrentRun`. No second API (e.g. “create run only”) needed—one hook, one callback.

**Lesson:** Don’t call setters for state that belongs to another hook. Either expose a callback from the hook (e.g. `onRunCreated`) or expose a minimal API (e.g. “create run only” + “start training”) and let the page orchestrate.

---

## 4. Categorisation summary

| Category              | Error / risk                                      | Type        | Where / when                          |
|-----------------------|----------------------------------------------------|------------|----------------------------------------|
| Streaming / timing    | Subscriber race → no frames during training        | Logic bug  | Frontend connect effect vs backend start |
| Streaming / timing    | Same for evaluation (Test)                         | Logic bug  | Frontend connect effect vs evaluate     |
| Streaming / timing    | Effect cleanup briefly disconnects before connect  | Ordering   | React effect deps + cleanup            |
| Backend / encoding    | Float or non-uint8 render output                   | Assumption | Callback + evaluator frame encoding     |
| Frontend / state      | Page calling setState for hook-owned state         | API misuse | handleTrain / useTraining               |

---

## 5. How to use this file

- **When you fix a bug:** Add a short entry under the right category (or add a category). Include: symptom, root cause, **Fix (latest, working)** with the method that actually works, and one-line lesson. If we tried multiple approaches, document only the one that works now.
- **When you find a better or working fix for an existing error:** Replace that entry’s Fix section with the new method. Do not keep multiple attempts; one entry = one current, working fix. Keeps the file consistent and authoritative.
- **When you hit an error:** Check this file first; it may be a known race or assumption and how we fixed it.
- **Before changing streams or training/eval flow:** Re-read §1 so subscriber timing stays correct.
- **Before adding a new env or render path:** Re-read §2 so frame encoding stays robust.
