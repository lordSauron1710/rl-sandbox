# Environment Variables

## Rules

- Every new environment variable must be documented in `.env.example` and `README.md`.
- Use `NEXT_PUBLIC_*` only for browser-safe values.
- Keep secrets server-only and inject them through deployment tooling, not source control.
- Do not commit local `.env` files.

## Current Security-Relevant Variables

- `APP_ENV`: backend runtime mode (`development` or `production`)
- `NEXT_PUBLIC_API_URL`: browser-safe backend API base URL
- `RLV_DEPLOYMENT_BOUNDARY`: production deployment posture (`public` by default, `private` only behind a trusted network boundary)
- `RLV_ACCESS_TOKEN`: deployment access secret required for public self-hosted backends
- `VERCEL_TOKEN`: optional Vercel CLI auth token for deployment helper scripts
- `VERCEL_PROJECT`: optional Vercel project name/id for non-interactive linking
- `VERCEL_SCOPE`: optional Vercel team/account scope for deployment helper scripts
- `VERCEL_DEPLOY_HOOK_URL`: optional Vercel production deploy hook fallback
- `CORS_ORIGINS`: explicit browser origins allowed to call the backend
- `FRONTEND_URL`: optional single frontend origin appended to allowed origins
- `CORS_ORIGIN_REGEX`: optional regex for preview origins
- `TRUSTED_HOSTS`: allowed host header values for backend HTTP traffic
- `ENABLE_API_DOCS`: optional override for interactive docs exposure
- `RLV_DB_PATH`: backend SQLite file path
- `RLV_RUNS_DIR`: backend artifact directory
