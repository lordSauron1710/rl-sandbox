# Prompt 15 - Presets Mapping + Bounds

**Date:** 2026-02-04  
**Status:** Implemented and validated.

---

## 1) Requirements vs implementation

| Requirement | Implementation | Status |
|---|---|---|
| Fast / Stable / High Score presets for each algorithm | `backend/app/training/presets.py` defines `PRESET_TABLES` for `PPO` and `DQN` with `fast`, `stable`, `high_score` profiles | OK |
| Bounds on timesteps, batch sizes, buffer sizes | `HYPERPARAMETER_BOUNDS` + pydantic field constraints in `backend/app/routers/runs.py` enforce bounded values | OK |
| Config schema validated server-side | `create_run` resolves preset + overrides and validates: bounds, cross-field checks, and algorithm-specific field allowlist (`_validate_algorithm_specific_overrides`) | OK |
| Return config on run detail for UI display | `GET /runs/{run_id}` returns `config` with `preset`, merged `hyperparameters`, and `seed` via `_build_run_response` | OK |
| Preset tables output | `GET /runs/presets` returns defaults, bounds, allowed fields, and preset mappings | OK |
| Validation logic coverage | `test-comprehensive.sh` includes preset, bounds, relationship checks, unknown key, and algorithm-specific field rejection checks | OK |
| Docs update | `docs/api-contract.md` and `README.md` updated to reflect Prompt 15 behavior and status | OK |

---

## 2) Files updated

- `backend/app/routers/runs.py`
- `backend/app/training/presets.py` (existing source of truth used for Prompt 15)
- `test-comprehensive.sh`
- `docs/api-contract.md`
- `docs/prompt-15-analysis-and-tests.md`
- `README.md`
- `errors.md`
- `roadmap.md`

---

## 3) Validation executed

- `python3 -m compileall backend/app` OK
- `./.venv/bin/python` targeted check: rejects `buffer_size` override for `PPO` with `422 invalid_hyperparameters` OK
- `./.venv/bin/python` targeted check: valid `DQN` preset+override resolution still works OK
- `bash -n test-comprehensive.sh` OK

---

## 4) Manual API spot checks (recommended)

1. `GET /api/v1/runs/presets` and confirm both `PPO` + `DQN` include `fast/stable/high_score`.
2. `POST /api/v1/runs` with `algorithm=PPO` and `hyperparameters.buffer_size` and confirm `422 invalid_hyperparameters`.
3. `POST /api/v1/runs` with `algorithm=DQN`, `preset=fast`, `total_timesteps` override and confirm response `config` includes merged values.
4. `GET /api/v1/runs/{id}` for created run and confirm `config.preset` + `config.hyperparameters` are returned for UI display.
