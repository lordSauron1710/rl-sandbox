# Authentication And Authorization

## Current Baseline

- v0 does not implement end-user authentication.
- Public self-hosted deployments use an optional deployment access token that is
  exchanged for an HttpOnly backend session cookie.
- Absence of auth does not mean browser state or local UI rules are a trust boundary.

## Current Deployment Rules

- Enforce deployment access on the server, not in the client only.
- Do not store deployment secrets in `localStorage` or `NEXT_PUBLIC_*` variables.
- Browser clients may exchange the deployment token for an HttpOnly cookie, but
  cookie-authenticated unsafe requests must still be origin-validated.
- Document session/token behavior, secret requirements, and deployment
  assumptions in `README.md`, `.env.example`, and deployment docs.
- Update `docs/policies/API.md`, `docs/policies/DEPLOYMENT.md`, and
  `docs/policies/ENV_VARIABLES.md` in the same change.
