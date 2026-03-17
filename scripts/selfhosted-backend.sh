#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy/selfhosted"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="${SELFHOSTED_ENV_FILE:-$DEPLOY_DIR/backend.env}"

usage() {
  cat <<'EOF'
Usage: scripts/selfhosted-backend.sh <command>

Commands:
  init-env Create deploy/selfhosted/backend.env from defaults/placeholders
  doctor   Validate local prerequisites and required backend env values
  api-url  Print the NEXT_PUBLIC_API_URL value to set in Vercel
  config   Render the resolved Docker Compose config
  up       Build and start the self-hosted backend stack
  health   Query the public backend health endpoint
  wait-healthy
           Poll the public backend health endpoint until it is healthy
  down     Stop the self-hosted backend stack
  logs     Follow logs for the self-hosted backend stack
  ps       Show service status
  backup   Create a tar.gz backup of the persistent /data volume
  restore  Restore the persistent /data volume from a tar.gz backup

Environment:
  SELFHOSTED_ENV_FILE  Optional override for the env file path
  SELFHOSTED_HEALTH_TIMEOUT_SECONDS  Optional wait-healthy timeout (default: 180)

First run:
  cp deploy/selfhosted/backend.env.example deploy/selfhosted/backend.env
  edit deploy/selfhosted/backend.env
EOF
}

die() {
  printf '[selfhosted][error] %s\n' "$*" >&2
  exit 1
}

warn() {
  printf '[selfhosted][warn] %s\n' "$*" >&2
}

info() {
  printf '[selfhosted] %s\n' "$*"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

require_compose() {
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "Missing env file: $ENV_FILE (copy backend.env.example first)"
}

load_env_file() {
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
}

resolve_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$PWD" "$path"
  fi
}

init_env() {
  local force="${1:-}"

  if [ -f "$ENV_FILE" ] && [ "$force" != "--force" ]; then
    die "Env file already exists: $ENV_FILE (use init-env --force to overwrite)"
  fi

  local api_domain="${API_DOMAIN:-api.example.com}"
  local frontend_url="${FRONTEND_URL:-https://your-project.vercel.app}"
  local cors_origins="${CORS_ORIGINS:-$frontend_url}"
  local cors_origin_regex="${CORS_ORIGIN_REGEX:-}"
  local trusted_hosts="${TRUSTED_HOSTS:-$api_domain}"
  local deployment_boundary="${RLV_DEPLOYMENT_BOUNDARY:-public}"
  local access_token="${RLV_ACCESS_TOKEN:-}"

  mkdir -p "$(dirname "$ENV_FILE")"
  cat >"$ENV_FILE" <<EOF
# Public HTTPS hostname for the backend.
API_DOMAIN=$api_domain

# Production backend mode.
APP_ENV=production
ENABLE_API_DOCS=false

# Declare whether the backend stays public or behind a trusted private network boundary.
RLV_DEPLOYMENT_BOUNDARY=$deployment_boundary

# Required for public deployments. Leave blank only if RLV_DEPLOYMENT_BOUNDARY=private
# and the backend is not reachable from the public internet.
RLV_ACCESS_TOKEN=$access_token

# Vercel frontend origin allowed to call the backend.
FRONTEND_URL=$frontend_url
CORS_ORIGINS=$cors_origins

# Optional preview support. Leave blank if you only want the production Vercel URL.
CORS_ORIGIN_REGEX=$cors_origin_regex

# Host allowlist for public HTTP traffic.
TRUSTED_HOSTS=$trusted_hosts
EOF

  info "Wrote $ENV_FILE"
  if [ "$api_domain" = "api.example.com" ] || [ "$frontend_url" = "https://your-project.vercel.app" ]; then
    warn "backend.env still contains placeholder hostnames; update API_DOMAIN/FRONTEND_URL before deploy"
  fi
}

doctor() {
  local errors=0

  require_env_file
  require_cmd docker
  require_compose
  load_env_file

  [ "${APP_ENV:-}" = "production" ] || {
    warn "APP_ENV should be 'production' for the self-hosted deployment"
    errors=$((errors + 1))
  }

  [ -n "${API_DOMAIN:-}" ] || {
    warn "API_DOMAIN is required"
    errors=$((errors + 1))
  }
  [ "${API_DOMAIN:-}" != "api.example.com" ] || {
    warn "API_DOMAIN still uses the example placeholder"
    errors=$((errors + 1))
  }
  [[ "${API_DOMAIN:-}" != *"://"* ]] || {
    warn "API_DOMAIN should be a hostname only, without http:// or https://"
    errors=$((errors + 1))
  }

  [ -n "${FRONTEND_URL:-}" ] || {
    warn "FRONTEND_URL is required"
    errors=$((errors + 1))
  }
  [ "${FRONTEND_URL:-}" != "https://your-project.vercel.app" ] || {
    warn "FRONTEND_URL still uses the example placeholder"
    errors=$((errors + 1))
  }
  [[ "${FRONTEND_URL:-}" == https://* ]] || {
    warn "FRONTEND_URL should use https:// for the hosted frontend"
    errors=$((errors + 1))
  }

  [ -n "${CORS_ORIGINS:-}" ] || {
    warn "CORS_ORIGINS is required"
    errors=$((errors + 1))
  }
  [[ "${CORS_ORIGINS:-}" == *"${FRONTEND_URL:-}"* ]] || {
    warn "CORS_ORIGINS should include FRONTEND_URL"
    errors=$((errors + 1))
  }

  [ -n "${TRUSTED_HOSTS:-}" ] || {
    warn "TRUSTED_HOSTS is required"
    errors=$((errors + 1))
  }
  [[ "${TRUSTED_HOSTS:-}" == *"${API_DOMAIN:-}"* ]] || {
    warn "TRUSTED_HOSTS should include API_DOMAIN"
    errors=$((errors + 1))
  }

  local deployment_boundary="${RLV_DEPLOYMENT_BOUNDARY:-public}"
  if [ "$deployment_boundary" != "public" ] && [ "$deployment_boundary" != "private" ]; then
    warn "RLV_DEPLOYMENT_BOUNDARY must be 'public' or 'private'"
    errors=$((errors + 1))
  fi

  if [ "$deployment_boundary" = "public" ] && [ -z "${RLV_ACCESS_TOKEN:-}" ]; then
    warn "RLV_ACCESS_TOKEN is required when RLV_DEPLOYMENT_BOUNDARY=public"
    errors=$((errors + 1))
  fi

  if [ "$deployment_boundary" = "private" ] && [ -z "${RLV_ACCESS_TOKEN:-}" ]; then
    warn "RLV_ACCESS_TOKEN is unset; ensure the backend is reachable only through a trusted private network boundary"
  fi
  if [ -n "${RLV_ACCESS_TOKEN:-}" ] && [ "${#RLV_ACCESS_TOKEN}" -lt 24 ]; then
    warn "RLV_ACCESS_TOKEN is short; use a longer random value"
  fi

  if [ "${ENABLE_API_DOCS:-false}" = "true" ]; then
    warn "ENABLE_API_DOCS=true exposes interactive docs in production"
  fi

  if [ "$errors" -gt 0 ]; then
    die "Doctor found $errors blocking issue(s)"
  fi

  info "Doctor checks passed for $ENV_FILE"
}

print_api_url() {
  load_env_file
  [ -n "${API_DOMAIN:-}" ] || die "API_DOMAIN is missing from $ENV_FILE"
  printf 'NEXT_PUBLIC_API_URL=https://%s/api/v1\n' "$API_DOMAIN"
}

get_health_url() {
  load_env_file
  [ -n "${API_DOMAIN:-}" ] || die "API_DOMAIN is missing from $ENV_FILE"
  printf 'https://%s/health\n' "$API_DOMAIN"
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

main() {
  local command="${1:-}"
  local archive_path=""
  local archive_name=""
  local timeout_seconds=""
  local deadline=""
  local health_url=""
  [ -n "$command" ] || {
    usage
    exit 1
  }

  case "$command" in
    init-env)
      init_env "${2:-}"
      ;;
    doctor)
      doctor
      ;;
    api-url)
      require_env_file
      print_api_url
      ;;
    config)
      require_env_file
      require_cmd docker
      require_compose
      compose config
      ;;
    up)
      require_env_file
      require_cmd docker
      require_compose
      compose up -d --build
      ;;
    health)
      require_env_file
      require_cmd curl
      curl -fsS "$(get_health_url)"
      ;;
    wait-healthy)
      require_env_file
      require_cmd curl
      timeout_seconds="${SELFHOSTED_HEALTH_TIMEOUT_SECONDS:-180}"
      deadline=$((SECONDS + timeout_seconds))
      health_url="$(get_health_url)"
      while (( SECONDS < deadline )); do
        if curl -fsS "$health_url" >/dev/null 2>&1; then
          info "Backend is healthy at $health_url"
          exit 0
        fi
        sleep 3
      done
      die "Timed out waiting for backend health at $health_url"
      ;;
    down)
      require_env_file
      require_cmd docker
      require_compose
      compose down
      ;;
    logs)
      require_env_file
      require_cmd docker
      require_compose
      compose logs -f --tail=200
      ;;
    ps)
      require_env_file
      require_cmd docker
      require_compose
      compose ps
      ;;
    backup)
      require_env_file
      require_cmd docker
      require_compose
      archive_path="$(resolve_path "${2:-$ROOT_DIR/tmp/selfhosted-backups/rl-sandbox-$(date +%Y%m%d-%H%M%S).tar.gz}")"
      archive_name="$(basename "$archive_path")"
      mkdir -p "$(dirname "$archive_path")"
      compose run --rm --no-deps -T -v "$(dirname "$archive_path"):/backup" backend \
        sh -lc "tar czf \"/backup/$archive_name\" -C /data ."
      printf '[selfhosted] Backup written to %s\n' "$archive_path"
      ;;
    restore)
      require_env_file
      require_cmd docker
      require_compose
      archive_path="${2:-}"
      [ -n "$archive_path" ] || die "Usage: scripts/selfhosted-backend.sh restore <backup.tar.gz>"
      archive_path="$(resolve_path "$archive_path")"
      [ -f "$archive_path" ] || die "Backup archive not found: $archive_path"
      archive_name="$(basename "$archive_path")"
      compose down
      compose run --rm --no-deps -T -v "$(dirname "$archive_path"):/backup:ro" backend \
        sh -lc "mkdir -p /data && rm -rf /data/* && tar xzf \"/backup/$archive_name\" -C /data"
      printf '[selfhosted] Restored data volume from %s\n' "$archive_path"
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
