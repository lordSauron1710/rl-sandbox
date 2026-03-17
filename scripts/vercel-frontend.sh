#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="${VERCEL_PROJECT_DIR:-$ROOT_DIR}"
SELFHOSTED_HELPER="$ROOT_DIR/scripts/selfhosted-backend.sh"

usage() {
  cat <<'EOF'
Usage: scripts/vercel-frontend.sh <command> [args]

Commands:
  status                  Show Vercel auth/link state and the computed API URL
  doctor                  Validate local prerequisites and Vercel project linkage
  whoami                  Show the authenticated Vercel account
  link                    Link the repo root to a Vercel project
  set-api-url [target]    Set NEXT_PUBLIC_API_URL from deploy/selfhosted/backend.env
  deploy [target]         Deploy the linked Vercel project
  sync-and-deploy [target]
                          Set NEXT_PUBLIC_API_URL, then deploy

Targets:
  production  Default. Sets production env / runs vercel deploy --prod
  preview     Sets preview env / runs vercel deploy

Environment:
  SELFHOSTED_ENV_FILE   Optional backend env override for API URL lookup
  VERCEL_PROJECT_DIR    Optional Vercel project dir (default: repo root)
  VERCEL_TOKEN          Optional Vercel auth token for non-interactive use
  VERCEL_PROJECT        Optional project name/id for non-interactive linking
  VERCEL_SCOPE          Optional Vercel team/account scope
  VERCEL_PREVIEW_GIT_BRANCH Optional preview branch for env sync
  VERCEL_DEPLOY_HOOK_URL Optional production deploy hook URL fallback
EOF
}

die() {
  printf '[vercel][error] %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[vercel] %s\n' "$*"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

ensure_project_dir() {
  [ -d "$PROJECT_DIR" ] || die "Missing Vercel project directory: $PROJECT_DIR"
}

run_vercel() {
  local cmd=(npx --yes vercel@latest)
  if [ -n "${VERCEL_SCOPE:-}" ]; then
    cmd+=(--scope "$VERCEL_SCOPE")
  fi
  if [ -n "${VERCEL_TOKEN:-}" ]; then
    cmd+=(--token "$VERCEL_TOKEN")
  fi
  cmd+=(--cwd "$PROJECT_DIR")
  cmd+=("$@")
  "${cmd[@]}"
}

is_linked() {
  [ -f "$PROJECT_DIR/.vercel/project.json" ]
}

is_authenticated() {
  run_vercel whoami </dev/null >/dev/null 2>&1
}

ensure_linked() {
  is_linked && return

  if [ -n "${VERCEL_PROJECT:-}" ]; then
    is_authenticated || die "Vercel CLI is not authenticated. Export VERCEL_TOKEN or log in before linking."
    run_vercel link --yes --project "$VERCEL_PROJECT"
    return
  fi

  die "The configured Vercel project dir is not linked. Run 'bash scripts/vercel-frontend.sh link' first, or set VERCEL_PROJECT for non-interactive linking."
}

resolve_target() {
  case "${1:-production}" in
    production|preview)
      printf '%s\n' "${1:-production}"
      ;;
    *)
      die "Unsupported target: ${1:-}"
      ;;
  esac
}

get_api_url_value() {
  local line
  line="$(SELFHOSTED_ENV_FILE="${SELFHOSTED_ENV_FILE:-}" bash "$SELFHOSTED_HELPER" api-url)"
  printf '%s\n' "${line#NEXT_PUBLIC_API_URL=}"
}

status() {
  local api_url=""

  ensure_project_dir
  if api_url="$(get_api_url_value 2>/dev/null)"; then
    info "Computed NEXT_PUBLIC_API_URL=$api_url"
  else
    info "Computed NEXT_PUBLIC_API_URL unavailable; check deploy/selfhosted/backend.env"
  fi

  if is_authenticated; then
    info "Vercel auth is available"
  else
    info "Vercel auth is missing"
  fi

  if is_linked; then
    info "Vercel project dir is linked"
  else
    info "Vercel project dir is not linked"
  fi

  info "VERCEL_PROJECT=${VERCEL_PROJECT:-unset}"
  info "VERCEL_SCOPE=${VERCEL_SCOPE:-unset}"
  if [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
    info "VERCEL_DEPLOY_HOOK_URL=set"
  else
    info "VERCEL_DEPLOY_HOOK_URL=unset"
  fi
}

doctor() {
  require_cmd npx
  ensure_project_dir
  is_authenticated || die "Vercel CLI is not authenticated. Export VERCEL_TOKEN or log in first."
  ensure_linked
  info "Doctor checks passed for $PROJECT_DIR"
}

link_project() {
  require_cmd npx
  ensure_project_dir

  if is_linked; then
    info "Vercel project dir is already linked"
    return
  fi

  if [ -n "${VERCEL_PROJECT:-}" ]; then
    is_authenticated || die "Vercel CLI is not authenticated. Export VERCEL_TOKEN or log in first."
    run_vercel link --yes --project "$VERCEL_PROJECT"
    return
  fi

  run_vercel link --yes
}

set_api_url() {
  local target
  local api_url
  target="$(resolve_target "${1:-production}")"
  api_url="$(get_api_url_value)"
  is_authenticated || die "Cannot set NEXT_PUBLIC_API_URL automatically without Vercel auth. Set it manually to $api_url."
  ensure_linked

  case "$target" in
    production)
      run_vercel env rm NEXT_PUBLIC_API_URL production -y >/dev/null 2>&1 || true
      run_vercel env add NEXT_PUBLIC_API_URL production --value "$api_url" --yes
      ;;
    preview)
      if [ -z "${VERCEL_PREVIEW_GIT_BRANCH:-}" ]; then
        die "Preview env sync needs VERCEL_PREVIEW_GIT_BRANCH on this Vercel project"
      fi
      run_vercel env rm NEXT_PUBLIC_API_URL preview "$VERCEL_PREVIEW_GIT_BRANCH" -y >/dev/null 2>&1 || true
      run_vercel env add NEXT_PUBLIC_API_URL preview "$VERCEL_PREVIEW_GIT_BRANCH" --value "$api_url" --yes
      ;;
  esac
  info "Set NEXT_PUBLIC_API_URL for Vercel target '$target' to $api_url"
}

deploy_project() {
  local target
  target="$(resolve_target "${1:-production}")"

  if ! is_authenticated; then
    [ "$target" = "production" ] || die "Preview deploys require authenticated Vercel CLI access."
    [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ] || die "Vercel auth is missing and VERCEL_DEPLOY_HOOK_URL is not set."
    require_cmd curl
    curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL"
    printf '\n'
    info "Triggered Vercel deploy hook"
    return
  fi

  ensure_linked
  case "$target" in
    production)
      run_vercel deploy --prod
      ;;
    preview)
      run_vercel deploy
      ;;
  esac
}

sync_and_deploy() {
  local target
  target="$(resolve_target "${1:-production}")"
  set_api_url "$target"
  deploy_project "$target"
}

main() {
  local command="${1:-}"
  [ -n "$command" ] || {
    usage
    exit 1
  }

  case "$command" in
    status)
      status
      ;;
    doctor)
      doctor
      ;;
    whoami)
      is_authenticated || die "Vercel CLI is not authenticated. Export VERCEL_TOKEN or log in first."
      run_vercel whoami
      ;;
    link)
      link_project
      ;;
    set-api-url)
      set_api_url "${2:-production}"
      ;;
    deploy)
      deploy_project "${2:-production}"
      ;;
    sync-and-deploy)
      sync_and_deploy "${2:-production}"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac
}

main "$@"
