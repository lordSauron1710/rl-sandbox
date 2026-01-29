"""
Run model and schemas for RL Gym Visualizer.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class RunStatus(str, Enum):
    """Status of a training/evaluation run."""
    PENDING = "pending"
    TRAINING = "training"
    PAUSED = "paused"
    COMPLETED = "completed"
    STOPPED = "stopped"
    FAILED = "failed"
    EVALUATING = "evaluating"


class RunConfig(BaseModel):
    """Configuration for a training run."""
    learning_rate: float = Field(default=0.0003, ge=1e-6, le=1.0)
    total_timesteps: int = Field(default=1000000, ge=1000, le=10000000)
    seed: Optional[int] = Field(default=None, ge=0)
    
    # PPO-specific (optional)
    batch_size: Optional[int] = Field(default=64, ge=1)
    n_steps: Optional[int] = Field(default=2048, ge=1)
    gamma: Optional[float] = Field(default=0.99, ge=0, le=1)
    
    # DQN-specific (optional)
    buffer_size: Optional[int] = Field(default=100000, ge=1000)
    exploration_fraction: Optional[float] = Field(default=0.1, ge=0, le=1)
    exploration_final_eps: Optional[float] = Field(default=0.05, ge=0, le=1)


class RunCreate(BaseModel):
    """Request schema for creating a new run."""
    env_id: str = Field(..., description="Environment ID (e.g., 'LunarLander-v2')")
    algorithm: str = Field(..., pattern="^(PPO|DQN)$", description="Algorithm: PPO or DQN")
    config: RunConfig = Field(default_factory=RunConfig)


class Run(BaseModel):
    """Full run model."""
    id: str
    env_id: str
    algorithm: str
    status: RunStatus
    config_json: str
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
