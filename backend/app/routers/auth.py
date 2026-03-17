"""
Deployment access-control endpoints.
"""
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.auth import (
    clear_session_cookie,
    is_access_control_enabled,
    is_request_authenticated,
    set_session_cookie,
    verify_access_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class SessionStatusResponse(BaseModel):
    """Current deployment access status."""
    access_control_enabled: bool
    authenticated: bool


class SessionCreateRequest(BaseModel):
    """Token exchange request for deployment access."""
    token: str = Field(..., min_length=1, description="Deployment access token")


def _build_status(request: Request) -> SessionStatusResponse:
    access_enabled = is_access_control_enabled()
    return SessionStatusResponse(
        access_control_enabled=access_enabled,
        authenticated=is_request_authenticated(request) if access_enabled else True,
    )


@router.get("/session", response_model=SessionStatusResponse)
async def get_session_status(request: Request) -> SessionStatusResponse:
    """Report whether deployment access is enabled and whether this client is authenticated."""
    return _build_status(request)


@router.post("/session", response_model=SessionStatusResponse)
async def create_session(
    payload: SessionCreateRequest,
    request: Request,
    response: Response,
) -> SessionStatusResponse:
    """Exchange the deployment token for an HttpOnly browser session cookie."""
    if not is_access_control_enabled():
        return _build_status(request)

    if not verify_access_token(payload.token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "invalid_token",
                    "message": "Invalid deployment access token.",
                }
            },
        )

    set_session_cookie(response)
    return SessionStatusResponse(access_control_enabled=True, authenticated=True)


@router.delete("/session", response_model=SessionStatusResponse)
async def delete_session(response: Response) -> SessionStatusResponse:
    """Clear the deployment access session cookie."""
    clear_session_cookie(response)
    return SessionStatusResponse(
        access_control_enabled=is_access_control_enabled(),
        authenticated=False,
    )
