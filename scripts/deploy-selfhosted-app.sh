#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_HELPER="$ROOT_DIR/scripts/selfhosted-backend.sh"
VERCEL_HELPER="$ROOT_DIR/scripts/vercel-frontend.sh"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-selfhosted-app.sh [command]

Commands:
  status              Show backend API URL plus Vercel auth/link status
  all                 Validate backend + Vercel, then deploy both
  backend             Validate and deploy only the self-hosted backend
  frontend-production Sync NEXT_PUBLIC_API_URL and deploy frontend to production
  frontend-preview    Sync NEXT_PUBLIC_API_URL and deploy frontend to preview

Environment:
  SELFHOSTED_ENV_FILE  Optional backend env override
  VERCEL_PROJECT_DIR   Optional Vercel project dir override
  VERCEL_TOKEN         Optional Vercel auth token
EOF
}

run_backend() {
  bash "$BACKEND_HELPER" doctor
  bash "$BACKEND_HELPER" up
  bash "$BACKEND_HELPER" wait-healthy
  bash "$BACKEND_HELPER" ps
}

run_frontend() {
  local target="${1:-production}"
  bash "$VERCEL_HELPER" sync-and-deploy "$target"
}

main() {
  local command="${1:-all}"

  case "$command" in
    status)
      bash "$BACKEND_HELPER" api-url
      bash "$VERCEL_HELPER" status
      ;;
    all)
      bash "$BACKEND_HELPER" doctor
      run_backend
      run_frontend production
      ;;
    backend)
      run_backend
      ;;
    frontend-production)
      run_frontend production
      ;;
    frontend-preview)
      run_frontend preview
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      printf '[deploy][error] Unknown command: %s\n' "$command" >&2
      exit 1
      ;;
  esac
}

main "$@"
