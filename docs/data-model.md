# Data Model — RL Gym Visualizer v0

## SQLite Schema

### Table: `runs`

Stores metadata for each training/evaluation run.

```sql
CREATE TABLE runs (
    id              TEXT PRIMARY KEY,           -- UUID v4
    env_id          TEXT NOT NULL,              -- e.g., 'LunarLander-v2'
    algorithm       TEXT NOT NULL,              -- 'PPO' or 'DQN'
    status          TEXT NOT NULL DEFAULT 'pending',  -- see status enum below
    config_json     TEXT NOT NULL,              -- JSON string of hyperparameters
    created_at      TEXT NOT NULL,              -- ISO 8601 timestamp
    updated_at      TEXT NOT NULL,              -- ISO 8601 timestamp
    started_at      TEXT,                       -- when training actually started
    completed_at    TEXT                        -- when training finished/stopped
);

CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX idx_runs_env_id ON runs(env_id);
```

**Status Enum:**
- `pending` — Run created, not started
- `training` — Training in progress
- `paused` — Training paused (future use)
- `completed` — Training finished successfully
- `stopped` — Training stopped by user
- `failed` — Training failed due to error
- `evaluating` — Evaluation in progress

### Table: `events`

Stores event log entries for each run.

```sql
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL,
    timestamp   TEXT NOT NULL,              -- ISO 8601 timestamp
    event_type  TEXT NOT NULL,              -- see event types below
    message     TEXT NOT NULL,
    metadata    TEXT,                       -- optional JSON for extra data
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_events_run_id ON events(run_id);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
```

**Event Types:**
| Type | Description |
|------|-------------|
| `training_started` | Training began |
| `training_stopped` | User stopped training |
| `training_completed` | Training finished all timesteps |
| `training_failed` | Training crashed/errored |
| `checkpoint_saved` | Model checkpoint saved |
| `evaluation_started` | Evaluation run began |
| `evaluation_completed` | Evaluation finished |
| `warning` | Non-fatal warning (e.g., high variance) |
| `error` | Error occurred |
| `info` | General info message |

---

## On-Disk Folder Layout

```
runs/
└── <run_id>/                       # UUID folder per run
    ├── config.json                 # Run configuration
    ├── metrics.jsonl               # Append-only metrics log
    ├── model/                      # Saved model checkpoints
    │   ├── checkpoint_latest.zip   # Latest checkpoint (SB3 format)
    │   └── checkpoint_best.zip     # Best checkpoint by mean reward
    └── eval/                       # Evaluation artifacts
        ├── eval_<timestamp>.mp4    # Recorded evaluation video
        ├── eval_<timestamp>.json   # Evaluation summary
        └── ...                     # Keep only latest K=3
```

**Retention Policy:**
- Evaluation videos: Keep only the latest **3** recordings
- Older eval files are automatically deleted when new ones are created

---

## Example: Run Config JSON

Stored in `runs/<run_id>/config.json` and in `runs.config_json` column.

```json
{
  "env_id": "LunarLander-v2",
  "algorithm": "PPO",
  "hyperparameters": {
    "learning_rate": 0.0003,
    "total_timesteps": 1000000,
    "batch_size": 64,
    "n_steps": 2048,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip_range": 0.2,
    "ent_coef": 0.0,
    "vf_coef": 0.5,
    "max_grad_norm": 0.5
  },
  "seed": 42,
  "device": "auto"
}
```

**DQN-specific hyperparameters:**
```json
{
  "env_id": "CartPole-v1",
  "algorithm": "DQN",
  "hyperparameters": {
    "learning_rate": 0.0001,
    "total_timesteps": 500000,
    "buffer_size": 100000,
    "learning_starts": 1000,
    "batch_size": 32,
    "tau": 1.0,
    "gamma": 0.99,
    "train_freq": 4,
    "target_update_interval": 1000,
    "exploration_fraction": 0.1,
    "exploration_final_eps": 0.05
  },
  "seed": 42,
  "device": "auto"
}
```

---

## Example: Metrics JSONL Format

Stored in `runs/<run_id>/metrics.jsonl` — one JSON object per line, append-only.

```jsonl
{"episode":1,"reward":-234.5,"length":89,"loss":null,"fps":142,"epsilon":1.0,"timestamp":"2026-01-29T10:00:01.234Z"}
{"episode":2,"reward":-189.2,"length":102,"loss":0.0342,"fps":148,"epsilon":0.99,"timestamp":"2026-01-29T10:00:02.456Z"}
{"episode":3,"reward":-156.8,"length":118,"loss":0.0298,"fps":151,"epsilon":0.98,"timestamp":"2026-01-29T10:00:03.789Z"}
{"episode":50,"reward":45.2,"length":245,"loss":0.0156,"fps":155,"entropy":0.42,"timestamp":"2026-01-29T10:02:15.123Z"}
{"episode":100,"reward":178.4,"length":302,"loss":0.0089,"fps":158,"entropy":0.31,"timestamp":"2026-01-29T10:05:42.567Z"}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `episode` | int | Episode number |
| `reward` | float | Total episode reward |
| `length` | int | Episode length (steps) |
| `loss` | float \| null | Training loss (null if not computed) |
| `fps` | int | Frames per second |
| `epsilon` | float | Exploration rate (DQN only) |
| `entropy` | float | Policy entropy (PPO only) |
| `approx_kl` | float | Approximate KL divergence (PPO only) |
| `timestamp` | string | ISO 8601 timestamp |

---

## Example: Evaluation Summary JSON

Stored in `runs/<run_id>/eval/eval_<timestamp>.json`.

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-29T11:03:00.000Z",
  "n_episodes": 10,
  "results": {
    "mean_reward": 204.2,
    "std_reward": 45.8,
    "min_reward": 112.5,
    "max_reward": 267.3,
    "mean_length": 302,
    "std_length": 58,
    "success_rate": 0.8
  },
  "video_path": "eval/eval_2026-01-29T11-03-00.mp4"
}
```

---

## Environment Registry

Hardcoded for v0 (not stored in DB).

```json
[
  {
    "id": "LunarLander-v2",
    "name": "LunarLander-v2",
    "display_id": "ID:01",
    "action_space_type": "Discrete",
    "action_space_size": 4,
    "obs_space_type": "Box",
    "obs_space_dims": 8,
    "description": "Land a spacecraft on the moon"
  },
  {
    "id": "CartPole-v1",
    "name": "CartPole-v1",
    "display_id": "ID:02",
    "action_space_type": "Discrete",
    "action_space_size": 2,
    "obs_space_type": "Box",
    "obs_space_dims": 4,
    "description": "Balance a pole on a cart"
  },
  {
    "id": "BipedalWalker-v3",
    "name": "BipedalWalker-v3",
    "display_id": "ID:03",
    "action_space_type": "Continuous",
    "action_space_size": 4,
    "obs_space_type": "Box",
    "obs_space_dims": 24,
    "description": "Teach a robot to walk"
  }
]
```

**Note:** DQN only supports discrete action spaces (LunarLander, CartPole). PPO supports all environments.
