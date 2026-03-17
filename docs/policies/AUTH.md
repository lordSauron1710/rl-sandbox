# Authentication And Authorization

## Current Baseline

- v0 does not implement end-user authentication.
- Absence of auth does not mean browser state or local UI rules are a trust boundary.

## If Auth Is Added Later

- Enforce auth on the server, not in the client only.
- Prefer route- or router-level enforcement instead of ad hoc per-handler checks.
- Do not store long-lived privileged tokens in `localStorage`.
- Document session/token behavior, secret requirements, and deployment assumptions in `README.md` and `.env.example`.
- Update `docs/policies/API.md`, `docs/policies/DEPLOYMENT.md`, and `docs/policies/ENV_VARIABLES.md` in the same change.
