"""
Run endpoints for RL Gym Visualizer.
"""
import json
from typing import Optional, List, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db import runs_repository, events_repository
from app.models.run import RunStatus
from app.models.event import EventType
from app.models.environment import get_environment
from app.storage.run_storage import RunStorage

router = APIRouter(prefix="/runs", tags=["runs"])


# ============================================================================
# Request/Response Schemas
# ============================================================================

class Hyperparameters(BaseModel):
    """Hyperparameters for training."""
    learning_rate: float = Field(default=0.0003, ge=1e-6, le=1.0)
    total_timesteps: int = Field(default=1000000, ge=1000, le=10000000)
    # Optional algorithm-specific params
    batch_size: Optional[int] = Field(default=64, ge=1)
    n_steps: Optional[int] = Field(default=2048, ge=1)
    gamma: Optional[float] = Field(default=0.99, ge=0, le=1)
    buffer_size: Optional[int] = Field(default=100000, ge=1000)
    exploration_fraction: Optional[float] = Field(default=0.1, ge=0, le=1)


class RunCreateRequest(BaseModel):
    """Request schema for creating a new run."""
    env_id: str = Field(..., description="Environment ID")
    algorithm: str = Field(..., pattern="^(PPO|DQN)$", description="Algorithm: PPO or DQN")
    hyperparameters: Hyperparameters = Field(default_factory=Hyperparameters)
    seed: Optional[int] = Field(default=None, ge=0)


class RunConfig(BaseModel):
    """Full run configuration."""
    env_id: str
    algorithm: str
    hyperparameters: dict
    seed: Optional[int] = None


class RunProgress(BaseModel):
    """Training progress information."""
    current_timestep: int = 0
    total_timesteps: int
    percent_complete: float = 0.0
    episodes_completed: int = 0


class LatestMetrics(BaseModel):
    """Latest metrics from training."""
    episode: int
    reward: float
    length: int
    loss: Optional[float] = None
    fps: int


class RunResponse(BaseModel):
    """Response schema for a single run."""
    id: str
    env_id: str
    algorithm: str
    status: str
    config: RunConfig
    progress: Optional[RunProgress] = None
    latest_metrics: Optional[LatestMetrics] = None
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class RunListItem(BaseModel):
    """Abbreviated run info for list responses."""
    id: str
    env_id: str
    algorithm: str
    status: str
    created_at: str
    updated_at: str


class RunsListResponse(BaseModel):
    """Response schema for list runs."""
    runs: List[RunListItem]
    total: int
    limit: int
    offset: int


class MessageResponse(BaseModel):
    """Simple message response."""
    id: str
    status: str
    message: str


class ErrorDetail(BaseModel):
    """Error detail schema."""
    code: str
    message: str
    details: Optional[dict] = None


class ErrorResponse(BaseModel):
    """Error response schema."""
    error: ErrorDetail


# ============================================================================
# Helper Functions
# ============================================================================

def _build_run_response(run_dict: dict) -> RunResponse:
    """Build a RunResponse from a database row."""
    config_data = json.loads(run_dict["config_json"])
    
    # Get progress and metrics from storage if available
    storage = RunStorage(run_dict["id"])
    progress = None
    latest_metrics = None
    
    if storage.exists():
        metrics = storage.get_metrics(tail=1)
        if metrics:
            latest = metrics[0]
            latest_metrics = LatestMetrics(
                episode=latest.get("episode", 0),
                reward=latest.get("reward", 0),
                length=latest.get("length", 0),
                loss=latest.get("loss"),
                fps=latest.get("fps", 0),
            )
        
        total_timesteps = config_data.get("hyperparameters", {}).get("total_timesteps", 1000000)
        metrics_count = storage.get_metrics_count()
        progress = RunProgress(
            current_timestep=0,  # Will be updated when training is implemented
            total_timesteps=total_timesteps,
            percent_complete=0.0,
            episodes_completed=metrics_count,
        )
    
    return RunResponse(
        id=run_dict["id"],
        env_id=run_dict["env_id"],
        algorithm=run_dict["algorithm"],
        status=run_dict["status"],
        config=RunConfig(
            env_id=config_data.get("env_id", run_dict["env_id"]),
            algorithm=config_data.get("algorithm", run_dict["algorithm"]),
            hyperparameters=config_data.get("hyperparameters", {}),
            seed=config_data.get("seed"),
        ),
        progress=progress,
        latest_metrics=latest_metrics,
        created_at=run_dict["created_at"],
        updated_at=run_dict["updated_at"],
        started_at=run_dict.get("started_at"),
        completed_at=run_dict.get("completed_at"),
    )


def _validate_env_algorithm(env_id: str, algorithm: str) -> None:
    """Validate environment and algorithm combination."""
    env = get_environment(env_id)
    if not env:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "invalid_env_id",
                    "message": f"Unknown environment: {env_id}",
                    "details": {"env_id": env_id}
                }
            }
        )
    
    if algorithm not in env.supported_algorithms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "algorithm_not_supported",
                    "message": f"Algorithm {algorithm} not supported for {env_id}",
                    "details": {
                        "env_id": env_id,
                        "algorithm": algorithm,
                        "supported": env.supported_algorithms
                    }
                }
            }
        )


# ============================================================================
# Endpoints
# ============================================================================

@router.post("", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(request: RunCreateRequest) -> RunResponse:
    """
    Create a new run with the specified configuration.
    
    The run is created in 'pending' status. Use the /runs/{id}/start
    endpoint to begin training.
    """
    # Validate environment and algorithm
    _validate_env_algorithm(request.env_id, request.algorithm)
    
    # Build config
    config = {
        "env_id": request.env_id,
        "algorithm": request.algorithm,
        "hyperparameters": request.hyperparameters.model_dump(exclude_none=True),
        "seed": request.seed,
    }
    
    # Create run in database
    run_dict = runs_repository.create_run(
        env_id=request.env_id,
        algorithm=request.algorithm,
        config=config,
    )
    
    # Initialize storage directory
    storage = RunStorage(run_dict["id"])
    storage.init_run_directory()
    storage.save_config(config)
    
    # Log creation event
    events_repository.create_event(
        run_id=run_dict["id"],
        event_type=EventType.INFO,
        message=f"Run created with {request.algorithm} on {request.env_id}",
        metadata={"config": config}
    )
    
    return _build_run_response(run_dict)


@router.get("", response_model=RunsListResponse)
async def list_runs(
    status: Optional[str] = Query(None, description="Filter by status"),
    env_id: Optional[str] = Query(None, description="Filter by environment"),
    limit: int = Query(20, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> RunsListResponse:
    """
    List runs with optional filtering and pagination.
    
    Results are sorted by creation time (newest first).
    """
    runs, total = runs_repository.list_runs(
        status=status,
        env_id=env_id,
        limit=limit,
        offset=offset,
    )
    
    return RunsListResponse(
        runs=[
            RunListItem(
                id=r["id"],
                env_id=r["env_id"],
                algorithm=r["algorithm"],
                status=r["status"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in runs
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    """
    Get detailed information about a specific run.
    
    Includes configuration, progress, and latest metrics.
    """
    run_dict = runs_repository.get_run(run_id)
    if not run_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "Run not found",
                    "details": {"run_id": run_id}
                }
            }
        )
    
    return _build_run_response(run_dict)


# ============================================================================
# Training Control (stubs for Prompt 05)
# ============================================================================

@router.post("/{run_id}/start", response_model=MessageResponse)
async def start_training(run_id: str) -> MessageResponse:
    """
    Start training for a pending run.
    
    Note: Training implementation will be added in Prompt 05.
    """
    run_dict = runs_repository.get_run(run_id)
    if not run_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "Run not found",
                    "details": {"run_id": run_id}
                }
            }
        )
    
    if run_dict["status"] != RunStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "conflict",
                    "message": f"Cannot start run in {run_dict['status']} status",
                    "details": {"current_status": run_dict["status"]}
                }
            }
        )
    
    # TODO: Implement actual training in Prompt 05
    # For now, just update status
    runs_repository.update_run_status(
        run_id=run_id,
        status=RunStatus.TRAINING,
        started_at=datetime.utcnow(),
    )
    
    events_repository.create_event(
        run_id=run_id,
        event_type=EventType.TRAINING_STARTED,
        message="Training started",
    )
    
    return MessageResponse(
        id=run_id,
        status="training",
        message="Training started"
    )


@router.post("/{run_id}/stop", response_model=MessageResponse)
async def stop_training(run_id: str) -> MessageResponse:
    """
    Stop a running training session.
    
    Note: Training implementation will be added in Prompt 05.
    """
    run_dict = runs_repository.get_run(run_id)
    if not run_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "Run not found",
                    "details": {"run_id": run_id}
                }
            }
        )
    
    if run_dict["status"] != RunStatus.TRAINING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "not_running",
                    "message": "Run is not currently training",
                    "details": {"current_status": run_dict["status"]}
                }
            }
        )
    
    # TODO: Implement actual stop in Prompt 05
    runs_repository.update_run_status(
        run_id=run_id,
        status=RunStatus.STOPPED,
        completed_at=datetime.utcnow(),
    )
    
    events_repository.create_event(
        run_id=run_id,
        event_type=EventType.TRAINING_STOPPED,
        message="Training stopped by user",
    )
    
    return MessageResponse(
        id=run_id,
        status="stopped",
        message="Training stopped"
    )


# ============================================================================
# Events
# ============================================================================

class EventResponse(BaseModel):
    """Event response schema."""
    id: int
    timestamp: str
    event_type: str
    message: str
    metadata: Optional[dict] = None


class EventsListResponse(BaseModel):
    """Response schema for list events."""
    events: List[EventResponse]
    total: int


@router.get("/{run_id}/events", response_model=EventsListResponse)
async def list_events(
    run_id: str,
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> EventsListResponse:
    """
    List events for a run.
    
    Events are returned in reverse chronological order (newest first).
    """
    # Verify run exists
    run_dict = runs_repository.get_run(run_id)
    if not run_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "not_found",
                    "message": "Run not found",
                    "details": {"run_id": run_id}
                }
            }
        )
    
    events, total = events_repository.list_events(
        run_id=run_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )
    
    return EventsListResponse(
        events=[
            EventResponse(
                id=e["id"],
                timestamp=e["timestamp"],
                event_type=e["event_type"],
                message=e["message"],
                metadata=json.loads(e["metadata"]) if e["metadata"] else None,
            )
            for e in events
        ],
        total=total,
    )
