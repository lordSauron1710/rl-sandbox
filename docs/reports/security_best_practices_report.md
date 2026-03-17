# Security Best Practices Report

## Executive Summary

- Added a policy-document workflow under `docs/policies/` so future auth, API, deployment, and env changes have explicit guardrails.
- Hardened the backend production posture with optional trusted hosts, production-disabled API docs by default, baseline security headers, and WebSocket origin validation.
- Added an optional deployment access-token flow for public self-hosted backends, using an HttpOnly session cookie for browser access.
- Upgraded the frontend Next.js line and backend Pillow floor to patched releases.

## Resolved Findings

### SBP-001

- **Severity:** Critical
- **Location:** `frontend/package.json`
- **Issue:** Next.js was pinned to an outdated 14.1.x release with multiple published advisories.
- **Fix:** Upgraded `next` and `eslint-config-next` to `15.5.10`, then re-ran `npm audit --omit=dev` with a clean result.

### SBP-002

- **Severity:** Medium
- **Location:** `backend/app/main.py`
- **Issue:** Interactive API docs were exposed by default and host validation was absent for production traffic.
- **Fix:** Docs now disable by default in production, and `TRUSTED_HOSTS` can enforce host allowlists.

### SBP-003

- **Severity:** Medium
- **Location:** `backend/app/streaming/router.py`
- **Issue:** WebSocket connections were accepted without explicit `Origin` validation.
- **Fix:** Added backend origin validation separate from CORS middleware.

### SBP-004

- **Severity:** Medium
- **Location:** `backend/requirements.txt`
- **Issue:** Pillow could resolve to a vulnerable line.
- **Fix:** Raised the minimum version to a patched release.

### SBP-005

- **Severity:** High
- **Location:** `backend/app/auth.py`, `backend/app/main.py`, `frontend/src/app/page.tsx`
- **Issue:** Public split deployments had no server-enforced access layer for training/evaluation routes.
- **Fix:** Added an optional deployment access token, server-side session exchange, cookie/origin enforcement, and a frontend unlock flow that does not embed secrets in the bundle.

## Remaining Risk

- v0 still does not have multi-user identities, per-user authorization, rate limiting, or quotas. The deployment access token is appropriate for personal/self-managed use, but broader public exposure still needs a stronger auth and abuse-control layer.
