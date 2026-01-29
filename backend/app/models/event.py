"""
Event model and schemas for RL Gym Visualizer.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class EventType(str, Enum):
    """Type of event in the event log."""
    TRAINING_STARTED = "training_started"
    TRAINING_STOPPED = "training_stopped"
    TRAINING_COMPLETED = "training_completed"
    TRAINING_FAILED = "training_failed"
    CHECKPOINT_SAVED = "checkpoint_saved"
    EVALUATION_STARTED = "evaluation_started"
    EVALUATION_COMPLETED = "evaluation_completed"
    WARNING = "warning"
    ERROR = "error"
    INFO = "info"


class EventCreate(BaseModel):
    """Request schema for creating a new event."""
    run_id: str
    event_type: EventType
    message: str
    metadata: Optional[dict] = None


class Event(BaseModel):
    """Full event model."""
    id: int
    run_id: str
    timestamp: datetime
    event_type: EventType
    message: str
    metadata: Optional[str] = None
    
    class Config:
        from_attributes = True
