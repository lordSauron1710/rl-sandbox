"""
Deployment access-control helpers.
"""
from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import Request, WebSocket
from starlette.datastructures import Headers

from app.security import is_origin_allowed, is_production

ACCESS_TOKEN_ENV = "RLV_ACCESS_TOKEN"
DEPLOYMENT_BOUNDARY_ENV = "RLV_DEPLOYMENT_BOUNDARY"
PUBLIC_DEPLOYMENT_BOUNDARY = "public"
PRIVATE_DEPLOYMENT_BOUNDARY = "private"
SESSION_COOKIE_NAME = "rlv_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
PUBLIC_PATHS = {
    "/",
    "/health",
    "/api/v1/auth/session",
}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_access_token() -> str | None:
    """Return the configured deployment access token, if any."""
    token = os.getenv(ACCESS_TOKEN_ENV, "").strip()
    return token or None


def get_deployment_boundary() -> str:
    """Return the declared production network boundary."""
    raw = os.getenv(DEPLOYMENT_BOUNDARY_ENV, "").strip().lower()
    return raw or PUBLIC_DEPLOYMENT_BOUNDARY


def validate_access_control_configuration() -> None:
    """Reject unsafe production startup configurations."""
    if not is_production():
        return

    boundary = get_deployment_boundary()
    if boundary not in {PUBLIC_DEPLOYMENT_BOUNDARY, PRIVATE_DEPLOYMENT_BOUNDARY}:
        raise RuntimeError(
            f"{DEPLOYMENT_BOUNDARY_ENV} must be '{PUBLIC_DEPLOYMENT_BOUNDARY}' or "
            f"'{PRIVATE_DEPLOYMENT_BOUNDARY}'."
        )

    if get_access_token() or boundary == PRIVATE_DEPLOYMENT_BOUNDARY:
        return

    raise RuntimeError(
        "Refusing to start the production backend without deployment access. "
        f"Set {ACCESS_TOKEN_ENV} for any public deployment, or set "
        f"{DEPLOYMENT_BOUNDARY_ENV}={PRIVATE_DEPLOYMENT_BOUNDARY} only when the "
        "backend stays behind a trusted private network boundary."
    )


def is_access_control_enabled() -> bool:
    """Whether deployment access control is enabled."""
    return get_access_token() is not None


def verify_access_token(candidate: str | None) -> bool:
    """Constant-time comparison for the configured access token."""
    token = get_access_token()
    if not token or not candidate:
        return False
    return hmac.compare_digest(candidate.strip(), token)


def _build_session_cookie_value() -> str | None:
    token = get_access_token()
    if not token:
        return None
    return hashlib.sha256(f"rlv-session:{token}".encode("utf-8")).hexdigest()


def has_valid_session_cookie(cookie_value: str | None) -> bool:
    """Validate the session cookie issued after token exchange."""
    expected = _build_session_cookie_value()
    if not expected or not cookie_value:
        return False
    return hmac.compare_digest(cookie_value, expected)


def should_secure_session_cookie() -> bool:
    """Secure cookies are required for production cross-site deployments."""
    return is_production()


def get_session_cookie_samesite() -> str:
    """Use `None` for cross-site Vercel -> API requests in production."""
    return "none" if should_secure_session_cookie() else "lax"


def set_session_cookie(response) -> None:
    """Attach the access session cookie to the response."""
    value = _build_session_cookie_value()
    if not value:
        return
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=value,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=should_secure_session_cookie(),
        samesite=get_session_cookie_samesite(),
        path="/",
    )


def clear_session_cookie(response) -> None:
    """Expire the access session cookie."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=should_secure_session_cookie(),
        samesite=get_session_cookie_samesite(),
        path="/",
    )


def is_public_path(path: str) -> bool:
    """Paths that stay reachable without a deployment session."""
    return path in PUBLIC_PATHS


def _get_bearer_token(headers: Headers) -> str | None:
    authorization = headers.get("authorization", "").strip()
    if not authorization:
        return None
    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return credentials.strip() or None


def _is_cookie_request_origin_allowed(method: str, origin: str | None) -> bool:
    if origin:
        return is_origin_allowed(origin)
    return method.upper() in SAFE_METHODS


def is_request_authenticated(request: Request) -> bool:
    """Validate bearer-token or session-cookie access for HTTP requests."""
    if not is_access_control_enabled():
        return True

    if verify_access_token(_get_bearer_token(request.headers)):
        return True

    cookie_value = request.cookies.get(SESSION_COOKIE_NAME)
    if not has_valid_session_cookie(cookie_value):
        return False

    origin = request.headers.get("origin")
    return _is_cookie_request_origin_allowed(request.method, origin)


def is_websocket_authenticated(websocket: WebSocket) -> bool:
    """Validate deployment access for browser WebSocket handshakes."""
    if not is_access_control_enabled():
        return True

    if verify_access_token(_get_bearer_token(websocket.headers)):
        return True

    cookie_value = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not has_valid_session_cookie(cookie_value):
        return False

    return is_origin_allowed(websocket.headers.get("origin"))
