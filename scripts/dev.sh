#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

AUTO_INSTALL=1
DRY_RUN=0

BACKEND_PID=""
FRONTEND_PID=""

usage() {
  cat <<'EOF'
Usage: scripts/dev.sh [--skip-install] [--dry-run]

Starts backend + frontend with shared env vars.
  --skip-install  Do not auto-install missing dependencies.
  --dry-run       Validate config and dependency state without starting servers.
EOF
}

log() {
  printf '[dev] %s\n' "$*"
}

warn() {
  printf '[dev][warn] %s\n' "$*" >&2
}

die() {
  printf '[dev][error] %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    log "Loading env vars from ${env_file#$ROOT_DIR/}"
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "Missing required command: $cmd"
  fi
}

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  else
    die "Python 3.10+ is required (python3 or python not found)."
  fi
}

validate_port() {
  local value="$1"
  local label="$2"
  case "$value" in
    ''|*[!0-9]*)
      die "$label must be an integer between 1 and 65535 (got '$value')."
      ;;
  esac

  if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    die "$label must be between 1 and 65535 (got '$value')."
  fi
}

normalize_path() {
  local value="$1"
  case "$value" in
    "~/"*)
      printf '%s/%s\n' "$HOME" "${value#~/}"
      ;;
    /*)
      printf '%s\n' "$value"
      ;;
    *)
      printf '%s/%s\n' "$ROOT_DIR" "$value"
      ;;
  esac
}

is_port_busy() {
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

ensure_backend_deps() {
  local requirements="$BACKEND_DIR/requirements.txt"
  local venv_dir="$BACKEND_DIR/.venv"
  local venv_python="$venv_dir/bin/python"
  local venv_pip="$venv_dir/bin/pip"
  local marker="$venv_dir/.requirements.fingerprint"
  local fingerprint installed

  if [ ! -d "$venv_dir" ]; then
    log "Creating backend virtualenv..."
    "$PYTHON_BIN" -m venv "$venv_dir"
  fi

  [ -x "$venv_python" ] || die "Backend virtualenv is missing python executable."
  [ -f "$requirements" ] || die "Missing backend requirements file: $requirements"

  fingerprint="$(cksum "$requirements" | awk '{print $1 ":" $2}')"
  installed="$(cat "$marker" 2>/dev/null || true)"

  if [ "$fingerprint" != "$installed" ]; then
    log "Installing backend dependencies..."
    "$venv_pip" install -r "$requirements"
    printf '%s\n' "$fingerprint" > "$marker"
  else
    log "Backend dependencies are up to date."
  fi
}

ensure_frontend_deps() {
  local lockfile="$FRONTEND_DIR/package-lock.json"
  local node_modules="$FRONTEND_DIR/node_modules"
  local lock_stamp="$node_modules/.package-lock.json"

  [ -f "$lockfile" ] || die "Missing frontend lockfile: $lockfile"

  if [ ! -d "$node_modules" ] || [ ! -f "$lock_stamp" ] || [ "$lockfile" -nt "$lock_stamp" ]; then
    log "Installing frontend dependencies..."
    (
      cd "$FRONTEND_DIR"
      npm install
    )
  else
    log "Frontend dependencies are up to date."
  fi
}

validate_existing_deps() {
  [ -x "$BACKEND_DIR/.venv/bin/uvicorn" ] || die "Backend dependencies missing. Run 'make install' or omit --skip-install."
  [ -d "$FRONTEND_DIR/node_modules" ] || die "Frontend dependencies missing. Run 'make install' or omit --skip-install."
}

print_config() {
  cat <<EOF
[dev] Configuration
  BACKEND_URL         http://${BACKEND_HOST}:${BACKEND_PORT}
  FRONTEND_URL        http://${FRONTEND_HOST}:${FRONTEND_PORT}
  NEXT_PUBLIC_API_URL ${NEXT_PUBLIC_API_URL}
  RLV_RUNS_DIR        ${RLV_RUNS_DIR}
  RLV_DB_PATH         ${RLV_DB_PATH}
  CORS_ORIGINS        ${CORS_ORIGINS}
EOF
}

stop_child() {
  local pid="$1"
  local name="$2"
  local ticks=0

  if [ -z "$pid" ] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  log "Stopping ${name} (pid ${pid})..."
  kill "$pid" >/dev/null 2>&1 || true

  while kill -0 "$pid" >/dev/null 2>&1; do
    ticks=$((ticks + 1))
    if [ "$ticks" -ge 30 ]; then
      warn "${name} did not stop gracefully; forcing kill."
      kill -9 "$pid" >/dev/null 2>&1 || true
      break
    fi
    sleep 0.2
  done
}

cleanup() {
  local code="${1:-0}"
  trap - INT TERM EXIT
  stop_child "$BACKEND_PID" "backend"
  stop_child "$FRONTEND_PID" "frontend"
  wait "$BACKEND_PID" >/dev/null 2>&1 || true
  wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  exit "$code"
}

handle_signal() {
  log "Received shutdown signal."
  cleanup 0
}

for arg in "$@"; do
  case "$arg" in
    --skip-install)
      AUTO_INSTALL=0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

[ -d "$BACKEND_DIR" ] || die "Missing backend directory: $BACKEND_DIR"
[ -d "$FRONTEND_DIR" ] || die "Missing frontend directory: $FRONTEND_DIR"

# Preserve explicit shell overrides so local .env files do not clobber them.
HAS_BACKEND_HOST=0
HAS_BACKEND_PORT=0
HAS_FRONTEND_HOST=0
HAS_FRONTEND_PORT=0
HAS_NEXT_PUBLIC_API_URL=0
HAS_RLV_RUNS_DIR=0
HAS_RLV_DB_PATH=0
HAS_CORS_ORIGINS=0

if [ "${BACKEND_HOST+x}" = "x" ]; then HAS_BACKEND_HOST=1; USER_BACKEND_HOST="$BACKEND_HOST"; fi
if [ "${BACKEND_PORT+x}" = "x" ]; then HAS_BACKEND_PORT=1; USER_BACKEND_PORT="$BACKEND_PORT"; fi
if [ "${FRONTEND_HOST+x}" = "x" ]; then HAS_FRONTEND_HOST=1; USER_FRONTEND_HOST="$FRONTEND_HOST"; fi
if [ "${FRONTEND_PORT+x}" = "x" ]; then HAS_FRONTEND_PORT=1; USER_FRONTEND_PORT="$FRONTEND_PORT"; fi
if [ "${NEXT_PUBLIC_API_URL+x}" = "x" ]; then HAS_NEXT_PUBLIC_API_URL=1; USER_NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL"; fi
if [ "${RLV_RUNS_DIR+x}" = "x" ]; then HAS_RLV_RUNS_DIR=1; USER_RLV_RUNS_DIR="$RLV_RUNS_DIR"; fi
if [ "${RLV_DB_PATH+x}" = "x" ]; then HAS_RLV_DB_PATH=1; USER_RLV_DB_PATH="$RLV_DB_PATH"; fi
if [ "${CORS_ORIGINS+x}" = "x" ]; then HAS_CORS_ORIGINS=1; USER_CORS_ORIGINS="$CORS_ORIGINS"; fi

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/.env.local"
load_env_file "$BACKEND_DIR/.env"
load_env_file "$FRONTEND_DIR/.env.local"

if [ "$HAS_BACKEND_HOST" -eq 1 ]; then BACKEND_HOST="$USER_BACKEND_HOST"; fi
if [ "$HAS_BACKEND_PORT" -eq 1 ]; then BACKEND_PORT="$USER_BACKEND_PORT"; fi
if [ "$HAS_FRONTEND_HOST" -eq 1 ]; then FRONTEND_HOST="$USER_FRONTEND_HOST"; fi
if [ "$HAS_FRONTEND_PORT" -eq 1 ]; then FRONTEND_PORT="$USER_FRONTEND_PORT"; fi
if [ "$HAS_NEXT_PUBLIC_API_URL" -eq 1 ]; then NEXT_PUBLIC_API_URL="$USER_NEXT_PUBLIC_API_URL"; fi
if [ "$HAS_RLV_RUNS_DIR" -eq 1 ]; then RLV_RUNS_DIR="$USER_RLV_RUNS_DIR"; fi
if [ "$HAS_RLV_DB_PATH" -eq 1 ]; then RLV_DB_PATH="$USER_RLV_DB_PATH"; fi
if [ "$HAS_CORS_ORIGINS" -eq 1 ]; then CORS_ORIGINS="$USER_CORS_ORIGINS"; fi

resolve_python
require_cmd npm
require_cmd cksum

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1}"
RLV_RUNS_DIR="${RLV_RUNS_DIR:-$BACKEND_DIR/runs}"
RLV_DB_PATH="${RLV_DB_PATH:-$BACKEND_DIR/data/rl_visualizer.db}"

RLV_RUNS_DIR="$(normalize_path "$RLV_RUNS_DIR")"
RLV_DB_PATH="$(normalize_path "$RLV_DB_PATH")"

if [ -z "${CORS_ORIGINS:-}" ]; then
  CORS_ORIGINS="http://${FRONTEND_HOST}:${FRONTEND_PORT}"
  if [ "$FRONTEND_HOST" != "localhost" ]; then
    CORS_ORIGINS="${CORS_ORIGINS},http://localhost:${FRONTEND_PORT}"
  fi
  if [ "$FRONTEND_HOST" != "127.0.0.1" ]; then
    CORS_ORIGINS="${CORS_ORIGINS},http://127.0.0.1:${FRONTEND_PORT}"
  fi
fi

validate_port "$BACKEND_PORT" "BACKEND_PORT"
validate_port "$FRONTEND_PORT" "FRONTEND_PORT"
[ "$BACKEND_PORT" != "$FRONTEND_PORT" ] || die "BACKEND_PORT and FRONTEND_PORT cannot be the same."

mkdir -p "$RLV_RUNS_DIR"
mkdir -p "$(dirname "$RLV_DB_PATH")"

export RLV_RUNS_DIR
export RLV_DB_PATH
export NEXT_PUBLIC_API_URL
export CORS_ORIGINS

print_config

if [ "$AUTO_INSTALL" -eq 1 ]; then
  ensure_backend_deps
  ensure_frontend_deps
else
  validate_existing_deps
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run complete."
  exit 0
fi

if is_port_busy "$BACKEND_PORT"; then
  die "Backend port ${BACKEND_PORT} is already in use. Stop the existing process or set BACKEND_PORT."
fi

if is_port_busy "$FRONTEND_PORT"; then
  die "Frontend port ${FRONTEND_PORT} is already in use. Stop the existing process or set FRONTEND_PORT."
fi

trap handle_signal INT TERM
trap 'cleanup $?' EXIT

log "Starting backend..."
(
  cd "$BACKEND_DIR"
  exec .venv/bin/uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID="$!"

log "Starting frontend..."
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) &
FRONTEND_PID="$!"

log "Development servers are running."

while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || BACKEND_EXIT_CODE="$?"
    BACKEND_EXIT_CODE="${BACKEND_EXIT_CODE:-1}"
    warn "Backend exited unexpectedly (code $BACKEND_EXIT_CODE)."
    cleanup "$BACKEND_EXIT_CODE"
  fi

  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID" || FRONTEND_EXIT_CODE="$?"
    FRONTEND_EXIT_CODE="${FRONTEND_EXIT_CODE:-1}"
    warn "Frontend exited unexpectedly (code $FRONTEND_EXIT_CODE)."
    cleanup "$FRONTEND_EXIT_CODE"
  fi

  sleep 1
done
