# API Policy

## Request Validation

- Validate request bodies and query params with Pydantic or equivalent schema validation.
- Bound numeric inputs that can affect runtime cost, queue pressure, or artifact size.
- Reject incompatible algorithm/environment config explicitly instead of silently dropping fields.

## Internet-Facing Behavior

- State-changing endpoints must not rely on CORS for protection.
- WebSocket endpoints must validate browser `Origin` separately from CORS.
- Keep interactive docs and schema exposure disabled in public production unless intentionally protected.
- If the backend is exposed publicly, require either a server-enforced auth layer
  or a trusted network boundary before allowing training/evaluation actions.
- Production startup must fail closed when neither `RLV_ACCESS_TOKEN` nor an
  explicit private deployment boundary is configured.
- Cookie-authenticated unsafe requests must validate `Origin` against the
  allowed frontend origin set.

## File And Stream Safety

- Keep artifact paths server-derived. Do not trust user-supplied filesystem paths.
- Validate filenames on download endpoints and perform defense-in-depth path checks.
- Do not stream secrets, raw stack traces, or internal filesystem paths to the frontend.
