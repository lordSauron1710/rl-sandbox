# QA Checklist and Acceptance Tests (v0)

This checklist defines acceptance criteria for the RL Gym Visualizer v0 and provides a repeatable test flow for backend + frontend behavior.

## Scope

- Backend API lifecycle: create, train, stop, evaluate, artifacts.
- Frontend dashboard behavior across idle/training/evaluating/completed states.
- Responsive behavior on mobile and tablet widths.
- Streaming performance sanity checks (SSE + chart updates).
- Failure-mode handling (stop actions, backend restart, missing artifacts).

## Test Environments

- Backend: `http://localhost:8000`
- API base: `http://localhost:8000/api/v1`
- Frontend: `http://localhost:3000`
- Browsers: Chrome (latest), Safari (latest on macOS)
- Mobile viewport checks: 375x812 (iPhone), 390x844, 768x1024, 1024x768

## Automated Acceptance (Backend)

Run with backend already up:

```bash
make test-smoke
make test
```

The comprehensive test (`test-comprehensive.sh`) validates:

- Health and environment discovery.
- Preview endpoints for all registered environments.
- Full run lifecycle (`pending -> training -> stopped/completed`).
- Evaluation completion and evaluation-stop paths.
- Run state transition guards (invalid start/stop/evaluate states).
- Artifact endpoints (config, metrics, eval summary/video, tail validation).
- Validation and error paths (unsupported combos, invalid IDs, invalid filenames).
- Preset mapping + hyperparameter bounds/relationship checks.
- Pagination and list parameter validation.

## Manual Acceptance Checklist

Mark each item pass/fail during release sign-off.

### A) Functional flows

1. Load dashboard with backend up; environments list appears.
2. Select each environment card; preview image updates without crashing UI.
3. Start training with PPO (CartPole-v1); run status changes to training.
4. Confirm live frame updates in center panel during training.
5. Confirm metrics cards update (Mean Reward, Episode Length, Loss, FPS).
6. Confirm reward history chart appends points while training.
7. Stop training; status transitions to stopped/completed.
8. Start evaluation (TEST) on trained run; status becomes evaluating.
9. Confirm evaluation progress appears and returns to stopped/completed afterward.
10. Confirm latest evaluation playback URL/video loads when available.
11. Confirm right-sidebar event log shows training/evaluation lifecycle events.
12. Confirm Generate Report flow opens/exports expected report content.

### B) Run state and guardrails

1. Try stopping a pending run (API): expect `409 not_running`.
2. Try evaluating a pending run (API): expect `409 invalid_status`.
3. Try evaluating while training: expect `409 invalid_status`.
4. Try duplicate start while already training: expect `409 conflict`.
5. Try stop evaluation when not evaluating: expect `409 not_evaluating`.
6. Create DQN run on BipedalWalker-v3: expect `400 algorithm_not_supported`.
7. Send out-of-bounds hyperparameters: expect `422`.
8. Send algorithm-incompatible hyperparameter fields: expect `422 invalid_hyperparameters`.

### C) Responsiveness checks (mobile + tablet)

For each viewport (`375`, `390`, `768`, `1024` widths):

1. Verify no horizontal page overflow.
2. Verify left controls remain reachable (env selection, presets, train/test buttons).
3. Verify center panel media/chart remain visible and readable.
4. Verify right sidebar content is readable and scrollable.
5. Verify action buttons remain tappable (no overlap/clipping).
6. Verify event log scrolling and report modal behavior are usable.

### D) Performance sanity checks

1. Start training and keep dashboard open for at least 2 minutes.
2. Confirm UI remains responsive while streams are active.
3. Confirm reward history chart continues updating smoothly.
4. Confirm SSE metrics do not spam excessively (target throttle is max ~4 updates/sec from backend).
5. Confirm frame stream remains stable at default fps (no permanent freeze).
6. Open DevTools console; confirm no recurring uncaught exceptions.

### E) Failure-mode checks

1. **Stop training mid-run**
   - Start a long run and stop quickly.
   - Confirm final status resolves to stopped/completed and UI recovers.
2. **Backend restart during active UI session**
   - While frontend is open, restart backend process.
   - Confirm UI surfaces connection failure gracefully (no crash).
   - Bring backend back up and confirm user can create/start a new run.
3. **Missing artifacts**
   - Request non-existent eval video path.
   - Confirm API returns `404` and frontend shows non-fatal playback/message fallback.
4. **Invalid run IDs / filenames**
   - Confirm endpoints reject malformed run IDs (`400`) and invalid eval filenames (`400`).

## Recommended Manual Test Run Order

1. Run `make test-smoke`.
2. Run `make test`.
3. Run frontend (`make frontend`) and perform sections A + C.
4. Perform section D performance checks on a 2+ minute session.
5. Perform section E failure-mode checks.
6. Record pass/fail notes and open issues for any regression.

## Exit Criteria (v0 acceptance)

Release candidate is accepted when all are true:

- `make test-smoke` passes.
- `make test` passes.
- All functional manual checks (A) pass.
- All responsiveness checks (C) pass on required widths.
- Performance sanity checks (D) show no critical degradation.
- Failure-mode checks (E) show graceful recovery behavior.
