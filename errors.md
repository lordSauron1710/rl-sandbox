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

### 1.5 Metrics SSE closed during evaluation

**Symptom:** Clicking TEST started evaluation, but reward history/metrics stopped updating quickly even though evaluation was running.

**Root cause:** `metrics_event_generator` considered only `pending` and `training` as active statuses. When run status became `evaluating`, the timeout branch emitted `training_complete` and closed the SSE stream.

**Fix (latest, working):** Treat `evaluating` as an active streaming state in the SSE generator (`training`, `pending`, `evaluating`). The stream now stays open during evaluation and only closes when the run reaches a terminal status.

**Lesson:** Stream lifecycle checks must include *all* producer states that can emit data, not just training.

---

### 1.6 Cross-thread pub/sub writes on asyncio.Queue

**Symptom:** Intermittent lost stream updates or unstable behavior under load.

**Root cause:** Training/evaluation run in background threads and published directly with `asyncio.Queue.put_nowait()`. `asyncio.Queue` is not thread-safe for direct cross-thread writes.

**Fix (latest, working):** Store each subscriber’s event loop and queue, then publish via `loop.call_soon_threadsafe(...)` to enqueue messages safely on the owning loop thread. Also clean up stale subscribers when loops close.

**Lesson:** For thread→async communication, always hop through the target loop with thread-safe scheduling.

---

### 1.7 Training live feed WebSocket closed with JSON serialization error

**Symptom:** During training, metrics and run status updated but the Live Feed stayed blank; WebSocket emitted `stream_error` and closed.

**Root cause:** Frame metadata (`reward`, sometimes `episode`/`step`) could be NumPy scalar types (e.g. `float32`) from training callbacks. WebSocket `send_json` cannot serialize NumPy scalar objects directly.

**Fix (latest, working):**
1. Coerce frame metadata to native Python numbers in `FramesPubSub.publish_frame` before publishing (`int(...)`/`float(...)` with safe fallback).
2. Also cast training callback values before publishing frames (`float(rewards[0])`, `int(step)`, etc.) so metadata is normalized at source.

**Lesson:** Any value crossing the WS/SSE JSON boundary must be normalized to built-in Python scalars; don’t pass NumPy scalar objects into transport payloads.

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

### 2.2 macOS crash when rendering pygame envs from background training thread

**Symptom:** Backend process crashed when training frame streaming started (especially CartPole/LunarLander on macOS), with `NSInternalInconsistencyException` about AppKit menu/main-thread usage.

**Root cause:** Pygame/SDL attempted to initialize a native display path from a non-main background thread during server-side rendering.

**Fix (latest, working):** Force SDL headless drivers before creating training/evaluation environments:
```python
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
```
Applied in `TrainingRunner._create_env` and `EvaluationRunner._create_env` so render paths stay off-screen and thread-safe for backend workloads.

**Lesson:** For server-side RL rendering, explicitly run SDL in headless mode; never depend on GUI display init from worker threads.

---

## 3. Frontend: state ownership & flow

### 3.1 Mutating state owned by another hook

**Mistake:** In an earlier fix attempt, the page called `setCurrentRun(run)` and then `connectFrames(run.id)` etc. from `handleTrain`. `currentRun` and `setCurrentRun` live inside `useTraining`, not in the page. The page doesn’t have `setCurrentRun`; only the hook does.

**Fix (latest, working):** Keep run state in the hook. Expose a callback: `createAndStartTraining(config, options?)` with `options.onRunCreated?: (run: ApiRun) => void`. The hook does: `createRun` → `setCurrentRun(run)` → `options?.onRunCreated?.(run)` → `startTraining(run.id)`. The page passes `onRunCreated: (run) => { connectMetrics(run.id); connectFrames(run.id, 15) }` so it can connect streams without ever calling `setCurrentRun`. No second API (e.g. “create run only”) needed—one hook, one callback.

**Lesson:** Don’t call setters for state that belongs to another hook. Either expose a callback from the hook (e.g. `onRunCreated`) or expose a minimal API (e.g. “create run only” + “start training”) and let the page orchestrate.

---

### 3.2 Hook swallowed async errors, UI reported false success

**Symptom:** UI sometimes logged “Training started”/“Evaluation started” even when backend calls failed.

**Root cause:** `useTraining` caught errors and set internal `error` state but did not rethrow, so callers’ `try/catch` blocks saw a resolved Promise and ran success paths.

**Fix (latest, working):** Re-throw caught errors from `createAndStartTraining`, `stop`, and `evaluate` after setting hook error state. Callers now correctly branch to error handling and do not emit false success events.

**Lesson:** If callers rely on async control flow, hooks should not swallow operational errors.

---

### 3.3 Report preview looked inconsistent when switching reports/formats

**Symptom:** In the report workflow modal, selecting another report could show clipped content (left side missing) and inconsistent preview layout.

**Root cause:** The shared `<pre>` preview container kept previous horizontal/vertical scroll offsets across report/format switches, so newly selected content rendered from an old scroll position.

**Fix (latest, working):**
1. Reset preview scroll offsets to top-left whenever selected report or format changes.
2. Key the preview pane by `${reportId}-${format}` so React remounts view state cleanly on switches.
3. Wrap text-format previews (`whitespace-pre-wrap break-words`) to avoid unnecessary horizontal scrolling for TXT reports.
4. Render view/download controls from a shared `FORMAT_OPTIONS` map so tab/action UI stays structurally consistent.

**Lesson:** Content viewers that reuse a scroll container should explicitly reset or remount on context switches; otherwise stale scroll state makes UI feel random.

---

### 3.4 Frontend crashed with `Cannot find module './575.js'` in Next dev

**Symptom:** The app returned a red Next.js Server Error overlay with `Cannot find module './575.js'` from `.next/server/webpack-runtime.js`.

**Root cause:** Stale/corrupted `.next` build artifacts left runtime chunk references out of sync with generated chunk locations. In recurrent incidents, this showed up with webpack cache rename `ENOENT` warnings under `.next/cache` and can be worsened if multiple Next dev processes were bound to port `3000`.

**Fix (latest, working):**
1. Fully stop Next dev (kill all processes bound to port 3000).
2. Remove frontend build cache only after stop: `rm -rf frontend/.next`.
3. Restart dev server on the usual host/port (`npm run dev -- -H 127.0.0.1 -p 3000`).
4. Verify recovery with `curl http://127.0.0.1:3000` (expect `200`) before reopening the app.

**Lesson:** When Next.js reports missing internal chunk modules, treat it as cache/runtime artifact drift first; clean `.next` and restart before deeper debugging.

---

### 3.5 App showed blocking "Checking backend access..." card on every refresh

**Symptom:** Opening or refreshing the frontend showed a centered "Checking backend access..." card before the dashboard rendered, even on deployments where no backend access token was configured.

**Root cause:** `Home` initialized the access gate state as `checking` and blocked first render until `/auth/session` completed. That forced an unnecessary intermediate loading screen for the normal open-access path.

**Fix (latest, working):** Default the page access state to `ready` and run the backend session check in the background. Only switch to `locked` if the backend explicitly reports `access_control_enabled && !authenticated`. Keep the existing fallback to `ready` when the backend is unreachable.

**Lesson:** Optional access-control probes should not block first paint for the common "open directly" path.

---

## 4. Backend: config guardrails

### 4.1 Algorithm-incompatible hyperparameters were silently ignored

**Symptom:** `POST /runs` accepted hyperparameter keys that do not belong to the selected algorithm (for example, `buffer_size` with `PPO`) and created runs without warning.

**Root cause:** Run creation validated values against a shared hyperparameter schema, then filtered disallowed keys before persistence. That removed incompatible fields instead of rejecting them.

**Fix (latest, working):** Validate explicit request overrides against `ALGORITHM_HYPERPARAMETER_FIELDS` before merging presets. If any override key is not allowed for the selected algorithm, return `422 invalid_hyperparameters` with `invalid_fields` and `allowed_fields` in the response details.

**Lesson:** For configuration APIs, reject incompatible fields explicitly; silent drops hide client mistakes and weaken guardrails.

---

### 4.2 Duplicate start requests can return different 409 error codes

**Symptom:** Edge-case tests that call `POST /runs/{id}/start` repeatedly observed either `detail.error.code = conflict` or `detail.error.code = training_error`, causing brittle assertions.

**Root cause:** There are two valid guard paths for the same logical failure:
1. Router status gate rejects starts from non-startable states (`conflict`).
2. Training manager rejects starts when a job is already active (`training_error`).
Timing decides which one triggers first.

**Fix (latest, working):** In edge/failure tests, assert `HTTP 409` as the primary invariant and accept either error code as “already started / cannot start now.”

**Lesson:** With async state transitions and layered guards, equivalent failures may surface through different error codes; tests should key on the stable contract first.

---

### 4.3 Completed runs reported partial or >100% progress

**Symptom:** Training could finish (including reward-saturation early stop), but `GET /runs/{id}` sometimes returned `progress.percent_complete` below 100 or above 100, so the UI progress indicator looked wrong near/after completion.

**Root cause:** Run progress mixed two sources:
1. Live manager progress (can briefly lag run status updates and can overshoot `total_timesteps` due rollout chunking).
2. Stored metrics progress (for early-stop completion, `current_timestep` can be less than configured `total_timesteps` by design).
Without terminal-status normalization, completed runs did not consistently map to 100%.

**Fix (latest, working):**
1. In `_build_run_response`, use live manager progress only for active statuses (`pending`, `training`, `evaluating`).
2. Clamp live and stored computed progress into `[0, 100]`.
3. Force `percent_complete = 100.0` when run status is `completed` (covers normal completion + adaptive early stop).
4. Add comprehensive test assertion that completed runs report 100% progress.

**Lesson:** Progress bars should represent lifecycle semantics, not raw step ratios alone; terminal `completed` must normalize to 100%.

---

## 5. Backend: background queue coordination

### 5.1 Evaluation appeared "done" before worker pickup

**Symptom:** `POST /runs/{id}/evaluate` returned success, but immediate reads of `GET /runs/{id}/evaluate/latest` and latest MP4 returned `404`.

**Root cause:** Evaluation is queued in SQLite and handled asynchronously. The route returned before the worker moved the job out of `queued`, so run status could still be `completed` from prior training when clients immediately checked terminal state.

**Fix (latest, working):** After enqueueing, the route waits briefly for the job to transition out of `queued` (or finish very quickly) before returning. This removes the "started but not actually dequeued yet" race.

**Lesson:** Queue-backed "start" endpoints should not acknowledge running semantics until dequeue handoff is observable.

---

### 5.2 Restart from `stopped` could conflict during cleanup handoff

**Symptom:** `POST /runs/{id}/start` right after a stop/terminal poll sometimes returned `409 conflict` ("already queued or in progress"), and follow-up stop calls could fail with `not_running`.

**Root cause:** We mixed persisted queue state with in-memory manager state. During short cleanup windows, run status could be `stopped` while the previous training thread was still winding down; queued-stop-before-start also left status as `pending` unless explicitly normalized.

**Fix (latest, working):**
1. When cancelling a queued training job before it starts, immediately set run status to `stopped`.

---

## 6. Security & deployment guardrails

### 6.1 WebSocket origin was not enforced in production

**Symptom:** Browser clients from arbitrary origins could attempt frame-stream WebSocket handshakes if the backend was publicly reachable.

**Root cause:** CORS middleware protects HTTP browser requests, but it does not validate WebSocket `Origin` for us. The frame stream accepted sockets without checking the caller origin explicitly.

**Fix (latest, working):** Centralize allowed-origin parsing in backend security helpers and reject WebSocket handshakes whose `Origin` is missing or not in the configured allowlist when running in production.

**Lesson:** For browser WebSockets, treat `Origin` validation as a separate production control; CORS settings alone are not sufficient.

---

### 6.2 Production backend docs/host posture was too permissive by default

**Symptom:** A deployed backend would expose interactive API docs by default and did not have an explicit host-header allowlist.

**Root cause:** FastAPI defaults left docs enabled, and we had no deployment-level helper for `TrustedHostMiddleware`.

**Fix (latest, working):** Disable API docs by default when `APP_ENV=production`, add optional `TRUSTED_HOSTS` middleware, and document both settings in `.env.example`, README, and deployment docs.

**Lesson:** Public production defaults should be conservative; make local development convenient, but require explicit opt-in for docs and broad host acceptance in production.
2. Do not hard-block enqueue on `manager.is_training`; let the worker own start timing.
3. In worker execution, if start fails with "already in progress", wait briefly for previous manager cleanup and retry start.

**Lesson:** When bridging durable queue state and ephemeral in-memory executors, handle transitional states explicitly instead of assuming status + thread lifecycle are perfectly synchronized.

---

### 6.3 Production backend started open when deployment token was unset

**Symptom:** A public production backend could start with `APP_ENV=production` and no `RLV_ACCESS_TOKEN`, leaving training/evaluation routes callable by anyone who could reach the API.

**Root cause:** Access control was entirely opt-in. If `RLV_ACCESS_TOKEN` was blank, the global HTTP middleware and WebSocket auth helpers treated every request as authenticated, even in production.

**Fix (latest, working):**
1. Add production startup validation so the backend refuses to boot unless either `RLV_ACCESS_TOKEN` is set or `RLV_DEPLOYMENT_BOUNDARY=private` explicitly declares a trusted private network boundary.
2. Thread `RLV_DEPLOYMENT_BOUNDARY` through deployment config, doctor checks, and docs so operators must choose a secure production posture intentionally.
3. Add unit coverage for the production access-config guard.

**Lesson:** Public security posture should fail closed at startup. Never make server-enforced access protection optional in production without an explicit, reviewable private-boundary override.

---

## 7. Categorisation summary

| Category              | Error / risk                                      | Type        | Where / when                          |
|-----------------------|----------------------------------------------------|------------|----------------------------------------|
| Streaming / timing    | Subscriber race → no frames during training        | Logic bug  | Frontend connect effect vs backend start |
| Streaming / timing    | Same for evaluation (Test)                         | Logic bug  | Frontend connect effect vs evaluate     |
| Streaming / timing    | Effect cleanup briefly disconnects before connect  | Ordering   | React effect deps + cleanup            |
| Backend / encoding    | Float or non-uint8 render output                   | Assumption | Callback + evaluator frame encoding     |
| Streaming / lifecycle | Metrics SSE closed when status became evaluating   | Logic bug  | SSE active-status check in stream router |
| Streaming / infra     | Cross-thread asyncio queue publish                 | Concurrency| Training/eval threads -> async subscribers |
| Streaming / payload   | WebSocket frame metadata used NumPy scalar types   | Type bug   | Frame pub/sub JSON serialization boundary |
| Backend / rendering   | Pygame SDL/AppKit crash in worker thread (macOS)   | Runtime bug| Training/evaluation env creation for frame streaming |
| Frontend / state      | Page calling setState for hook-owned state         | API misuse | handleTrain / useTraining               |
| Frontend / state      | Hook swallowed async errors                         | Flow bug   | useTraining success/error propagation    |
| Frontend / UI state   | Report preview reused stale scroll offsets          | UX bug     | report workflow preview pane             |
| Frontend / tooling    | Missing Next chunk module (`./575.js`)              | Build cache drift | stale `.next` runtime artifacts |
| Frontend / load flow  | Blocking backend-access check showed on every refresh | UX bug   | `Home` access-gate bootstrap before dashboard render |
| Backend / validation  | Algorithm-incompatible hyperparameters accepted     | Schema bug | `POST /runs` override validation         |
| Backend / API semantics | Duplicate start returns alternate 409 error codes | Race/contract nuance | router vs manager start guards |
| Backend / progress semantics | Completed runs reported partial or >100% progress | Logic bug | `GET /runs/{id}` progress composition (manager + storage) |
| Backend / queue timing | Evaluate acknowledged before dequeue handoff       | Ordering bug | `/runs/{id}/evaluate` + worker queue pickup |
| Backend / queue lifecycle | Stop/start restart conflict during cleanup handoff | Lifecycle race | worker queue vs manager in-memory job teardown |
| Security / deployment | Production backend booted open with no token       | Guardrail bug | production startup auth posture |

---

## 8. How to use this file

- **When you fix a bug:** Add a short entry under the right category (or add a category). Include: symptom, root cause, **Fix (latest, working)** with the method that actually works, and one-line lesson. If we tried multiple approaches, document only the one that works now.
- **When you find a better or working fix for an existing error:** Replace that entry’s Fix section with the new method. Do not keep multiple attempts; one entry = one current, working fix. Keeps the file consistent and authoritative.
- **When you hit an error:** Check this file first; it may be a known race or assumption and how we fixed it.
- **Before changing streams or training/eval flow:** Re-read §1 so subscriber timing stays correct.
- **Before adding a new env or render path:** Re-read §2 so frame encoding stays robust.
