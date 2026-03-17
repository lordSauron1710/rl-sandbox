# Environment Variables

## Rules

- Every new environment variable must be documented in `.env.example` and `README.md`.
- Use `NEXT_PUBLIC_*` only for browser-safe values.
- Keep secrets server-only and inject them through deployment tooling, not source control.
- Do not commit local `.env` files.

## Current Security-Relevant Variables

- `APP_ENV`: backend runtime mode (`development` or `production`)
- `NEXT_PUBLIC_API_URL`: browser-safe backend API base URL
- `RLV_ACCESS_TOKEN`: deployment access secret for the self-hosted backend
- `CORS_ORIGINS`: explicit browser origins allowed to call the backend
- `FRONTEND_URL`: optional single frontend origin appended to allowed origins
- `CORS_ORIGIN_REGEX`: optional regex for preview origins
- `TRUSTED_HOSTS`: allowed host header values for backend HTTP traffic
- `ENABLE_API_DOCS`: optional override for interactive docs exposure
- `RLV_DB_PATH`: backend SQLite file path
- `RLV_RUNS_DIR`: backend artifact directory
