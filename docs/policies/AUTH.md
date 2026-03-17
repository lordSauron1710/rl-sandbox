# Authentication And Authorization

## Current Baseline

- v0 does not implement end-user authentication.
- Public self-hosted deployments use a deployment access token that is
  exchanged for an HttpOnly backend session cookie.
- Production deployments may leave the token unset only when
  `RLV_DEPLOYMENT_BOUNDARY=private` explicitly documents a trusted private
  network boundary.
- Absence of auth does not mean browser state or local UI rules are a trust boundary.

## Current Deployment Rules

- Enforce deployment access on the server, not in the client only.
- Do not store deployment secrets in `localStorage` or `NEXT_PUBLIC_*` variables.
- Browser clients may exchange the deployment token for an HttpOnly cookie, but
  cookie-authenticated unsafe requests must still be origin-validated.
- Production startup must reject ambiguous open-access posture; operators must
  choose a token-protected public deployment or an explicit private boundary.
- Document session/token behavior, secret requirements, and deployment
  assumptions in `README.md`, `.env.example`, and deployment docs.
- Update `docs/policies/API.md`, `docs/policies/DEPLOYMENT.md`, and
  `docs/policies/ENV_VARIABLES.md` in the same change.
