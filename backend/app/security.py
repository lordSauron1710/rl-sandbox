"""
Security and deployment helpers shared across the backend.
"""
from __future__ import annotations

import os
import re

_LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)
_LOCAL_HOSTS = (
    "localhost",
    "127.0.0.1",
    "testserver",
)


def get_app_env() -> str:
    """Return the normalized application environment."""
    return os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()


def is_production() -> bool:
    """Whether the app is running in production mode."""
    return get_app_env() == "production"


def should_expose_api_docs() -> bool:
    """
    Expose interactive API docs in development by default.

    Production defaults to disabled unless explicitly enabled.
    """
    raw = os.getenv("ENABLE_API_DOCS", "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return not is_production()


def get_cors_origins() -> list[str]:
    """
    Read allowed frontend origins from env, with safe local defaults.

    Supports:
      - CORS_ORIGINS="https://app.example.com,https://preview.example.com"
      - FRONTEND_URL="https://app.example.com" (appended if not present)
    """
    raw = os.getenv("CORS_ORIGINS", ",".join(_LOCAL_ORIGINS))

    origins: list[str] = []
    seen: set[str] = set()

    for value in raw.split(","):
        origin = value.strip().rstrip("/")
        if not origin or origin in seen:
            continue
        origins.append(origin)
        seen.add(origin)

    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_url and frontend_url not in seen:
        origins.append(frontend_url)

    return origins or list(_LOCAL_ORIGINS)


def get_cors_origin_regex() -> str | None:
    """
    Optional regex for dynamic origins, for example preview URLs.
    """
    raw = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    return raw or None


def is_origin_allowed(origin: str | None) -> bool:
    """
    Validate browser origins for WebSocket handshakes.

    Browsers send an Origin header for WebSockets, but CORS middleware does not
    enforce it for us. In development we tolerate missing Origin to keep local
    tools usable; in production we require an allowed browser origin.
    """
    if not origin:
        return not is_production()

    normalized = origin.strip().rstrip("/")
    if normalized in get_cors_origins():
        return True

    pattern = get_cors_origin_regex()
    return bool(pattern and re.match(pattern, normalized))


def get_trusted_hosts() -> list[str]:
    """
    Parse optional trusted host allowlist for public HTTP traffic.
    """
    raw = os.getenv("TRUSTED_HOSTS", "").strip()
    hosts: list[str] = []
    seen: set[str] = set()

    for value in raw.split(","):
        host = value.strip()
        if not host or host in seen:
            continue
        hosts.append(host)
        seen.add(host)

    if not is_production():
        for host in _LOCAL_HOSTS:
            if host not in seen:
                hosts.append(host)
                seen.add(host)

    return hosts
