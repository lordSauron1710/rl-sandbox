# Policy Index

This repository uses `AGENTS.md` as the primary instruction file. The policy
documents in `docs/policies/` are supplemental rules for security-sensitive and
deployment-sensitive work.

## Precedence

1. `AGENTS.md`
2. `docs/policies/SECURITY.md`
3. The policy file most specific to the surface area you are changing
4. `README.md`, `docs/guides/deployment.md`, and `errors.md`

## Read For Every Change

- `docs/policies/SECURITY.md`
- `docs/policies/ACCESSIBILITY.md`
- `docs/policies/ENV_VARIABLES.md`
- `docs/policies/DEPLOYMENT.md`

## Read When Introducing New Surface Area

- `docs/policies/AUTH.md` before login, sessions, roles, or protected views
- `docs/policies/API.md` before adding or widening network-facing handlers
- `docs/policies/DATABASE.md` before changing persistence, storage layout, or DB engines
- `docs/policies/INCIDENT_RESPONSE.md` when handling suspected credential exposure or abuse

## Required Follow-Through

- If a change adds auth, APIs, persistence, environment variables, or deployment behavior, update the relevant policy file in the same change.
- Keep `.env.example` and `README.md` aligned with the live configuration contract.
- Run `npm audit --omit=dev` for frontend dependency changes.
- Run `pip-audit -r backend/requirements.txt` for backend dependency changes.
- Keep `errors.md` current when a bug fix changes how critical flows or production guardrails work.
