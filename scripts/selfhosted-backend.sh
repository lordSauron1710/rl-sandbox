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
  api-url  Print the NEXT_PUBLIC_API_URL value to set in Vercel
  config   Render the resolved Docker Compose config
  up       Build and start the self-hosted backend stack
  down     Stop the self-hosted backend stack
  logs     Follow logs for the self-hosted backend stack
  ps       Show service status
  backup   Create a tar.gz backup of the persistent /data volume
  restore  Restore the persistent /data volume from a tar.gz backup

Environment:
  SELFHOSTED_ENV_FILE  Optional override for the env file path

First run:
  cp deploy/selfhosted/backend.env.example deploy/selfhosted/backend.env
  edit deploy/selfhosted/backend.env
EOF
}

die() {
  printf '[selfhosted][error] %s\n' "$*" >&2
  exit 1
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

print_api_url() {
  load_env_file
  [ -n "${API_DOMAIN:-}" ] || die "API_DOMAIN is missing from $ENV_FILE"
  printf 'NEXT_PUBLIC_API_URL=https://%s/api/v1\n' "$API_DOMAIN"
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

main() {
  local command="${1:-}"
  local archive_path=""
  local archive_name=""
  [ -n "$command" ] || {
    usage
    exit 1
  }

  require_env_file

  case "$command" in
    api-url)
      print_api_url
      ;;
    config)
      require_cmd docker
      require_compose
      compose config
      ;;
    up)
      require_cmd docker
      require_compose
      compose up -d --build
      ;;
    down)
      require_cmd docker
      require_compose
      compose down
      ;;
    logs)
      require_cmd docker
      require_compose
      compose logs -f --tail=200
      ;;
    ps)
      require_cmd docker
      require_compose
      compose ps
      ;;
    backup)
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
