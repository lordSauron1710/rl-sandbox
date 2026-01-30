# API Contract — RL Gym Visualizer v0

This document defines the minimal backend API contract using REST + SSE (Server-Sent Events) with WebSocket support for live frame streaming.

**Base URL:** `http://localhost:8000/api/v1`

---

## Table of Contents

1. [Environments](#environments)
2. [Runs](#runs)
3. [Training Control](#training-control)
4. [Evaluation](#evaluation)
5. [Artifacts](#artifacts)
6. [Streaming (SSE)](#streaming-sse)
7. [Live Frames (WebSocket)](#live-frames-websocket)
8. [Error Handling](#error-handling)
9. [Status Transitions](#status-transitions)

---

## Environments

### List Environments

Returns metadata for all supported environments.

```
GET /environments
```

**Response:** `200 OK`

```json
{
  "environments": [
    {
      "id": "LunarLander-v2",
      "name": "LunarLander-v2",
      "display_id": "ID:01",
      "action_space_type": "Discrete",
      "action_space_size": 4,
      "obs_space_type": "Box",
      "obs_space_dims": 8,
      "description": "Land a spacecraft on the moon",
      "supported_algorithms": ["PPO", "DQN"]
    },
    {
      "id": "CartPole-v1",
      "name": "CartPole-v1",
      "display_id": "ID:02",
      "action_space_type": "Discrete",
      "action_space_size": 2,
      "obs_space_type": "Box",
      "obs_space_dims": 4,
      "description": "Balance a pole on a cart",
      "supported_algorithms": ["PPO", "DQN"]
    },
    {
      "id": "BipedalWalker-v3",
      "name": "BipedalWalker-v3",
      "display_id": "ID:03",
      "action_space_type": "Continuous",
      "action_space_size": 4,
      "obs_space_type": "Box",
      "obs_space_dims": 24,
      "description": "Teach a robot to walk",
      "supported_algorithms": ["PPO"]
    }
  ]
}
```

---

## Runs

### Create Run

Creates a new run with specified configuration. Does not start training.

```
POST /runs
```

**Request Body:**

```json
{
  "env_id": "LunarLander-v2",
  "algorithm": "PPO",
  "hyperparameters": {
    "learning_rate": 0.0003,
    "total_timesteps": 1000000
  },
  "seed": 42
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `env_id` | string | Yes | Environment identifier |
| `algorithm` | string | Yes | "PPO" or "DQN" |
| `hyperparameters` | object | Yes | Training hyperparameters |
| `hyperparameters.learning_rate` | float | Yes | Learning rate (default: 0.0003) |
| `hyperparameters.total_timesteps` | int | Yes | Total training steps |
| `seed` | int | No | Random seed (default: null for random) |

**Response:** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "env_id": "LunarLander-v2",
  "algorithm": "PPO",
  "status": "pending",
  "config": {
    "env_id": "LunarLander-v2",
    "algorithm": "PPO",
    "hyperparameters": {
      "learning_rate": 0.0003,
      "total_timesteps": 1000000
    },
    "seed": 42
  },
  "created_at": "2026-01-29T10:00:00.000Z",
  "updated_at": "2026-01-29T10:00:00.000Z",
  "started_at": null,
  "completed_at": null
}
```

**Errors:**
- `400 Bad Request` — Invalid env_id, algorithm, or algorithm not supported for environment
- `422 Unprocessable Entity` — Validation error in hyperparameters

---

### List Runs

Returns a paginated list of runs, sorted by creation time (newest first).

```
GET /runs
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter by status |
| `env_id` | string | — | Filter by environment |
| `limit` | int | 20 | Max results (1-100) |
| `offset` | int | 0 | Pagination offset |

**Response:** `200 OK`

```json
{
  "runs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "env_id": "LunarLander-v2",
      "algorithm": "PPO",
      "status": "training",
      "created_at": "2026-01-29T10:00:00.000Z",
      "updated_at": "2026-01-29T10:05:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### Get Run Detail

Returns full details for a specific run.

```
GET /runs/{run_id}
```

**Response:** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "env_id": "LunarLander-v2",
  "algorithm": "PPO",
  "status": "training",
  "config": {
    "env_id": "LunarLander-v2",
    "algorithm": "PPO",
    "hyperparameters": {
      "learning_rate": 0.0003,
      "total_timesteps": 1000000
    },
    "seed": 42
  },
  "progress": {
    "current_timestep": 50000,
    "total_timesteps": 1000000,
    "percent_complete": 5.0,
    "episodes_completed": 42
  },
  "latest_metrics": {
    "episode": 42,
    "reward": 145.2,
    "length": 289,
    "loss": 0.0123,
    "fps": 156
  },
  "created_at": "2026-01-29T10:00:00.000Z",
  "updated_at": "2026-01-29T10:05:00.000Z",
  "started_at": "2026-01-29T10:00:05.000Z",
  "completed_at": null
}
```

**Errors:**
- `404 Not Found` — Run not found

---

## Training Control

### Start Training

Starts training for a pending run.

```
POST /runs/{run_id}/start
```

**Request Body:** None

**Response:** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "training",
  "message": "Training started"
}
```

**Errors:**
- `404 Not Found` — Run not found
- `409 Conflict` — Run already started or completed

---

### Stop Training

Stops a running training session.

```
POST /runs/{run_id}/stop
```

**Request Body:** None

**Response:** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "stopped",
  "message": "Training stopped"
}
```

**Errors:**
- `404 Not Found` — Run not found
- `409 Conflict` — Run not in training state

---

## Evaluation

### Trigger Evaluation

Runs evaluation on the current trained model.

```
POST /runs/{run_id}/evaluate
```

**Request Body:**

```json
{
  "n_episodes": 10,
  "render": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `n_episodes` | int | 10 | Number of evaluation episodes (1-100) |
| `render` | bool | true | Whether to record video and stream frames |

**Response:** `202 Accepted`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "evaluating",
  "message": "Evaluation started",
  "eval_config": {
    "n_episodes": 10,
    "render": true
  }
}
```

**Errors:**
- `404 Not Found` — Run not found
- `409 Conflict` — Run has no trained model, or already evaluating
- `400 Bad Request` — Invalid n_episodes

---

### Get Latest Evaluation

Returns the most recent evaluation summary.

```
GET /runs/{run_id}/evaluation
```

**Response:** `200 OK`

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
  "video_url": "/api/v1/runs/550e8400-e29b-41d4-a716-446655440000/artifacts/eval/latest.mp4"
}
```

**Errors:**
- `404 Not Found` — Run or evaluation not found

---

## Artifacts

### Get Run Config

Returns the run configuration used when the run was created.

```
GET /runs/{run_id}/artifacts/config
```

**Response:** `200 OK`

```json
{
  "env_id": "LunarLander-v2",
  "algorithm": "PPO",
  "hyperparameters": {
    "learning_rate": 0.0003,
    "total_timesteps": 1000000,
    "batch_size": 64,
    "n_steps": 2048,
    "gamma": 0.99
  },
  "seed": 42
}
```

**Errors:**
- `400 Bad Request` — Invalid run_id format
- `404 Not Found` — Run not found

---

### Get Metrics

Returns training metrics from the metrics JSONL file.

```
GET /runs/{run_id}/artifacts/metrics
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tail` | int | — | Return only last N entries (1-10000) |

**Response:** `200 OK`

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_entries": 100,
  "metrics": [
    {
      "episode": 1,
      "reward": -234.5,
      "length": 89,
      "loss": null,
      "fps": 142,
      "timestep": 89,
      "timestamp": "2026-01-29T10:00:01.234Z"
    },
    {
      "episode": 2,
      "reward": -189.2,
      "length": 102,
      "loss": 0.0342,
      "fps": 148,
      "timestep": 191,
      "timestamp": "2026-01-29T10:00:02.456Z"
    }
  ]
}
```

**Errors:**
- `400 Bad Request` — Invalid run_id format
- `404 Not Found` — Run or storage not found

---

### Get Evaluation Video (Latest)

Serves the latest evaluation video file.

```
GET /runs/{run_id}/artifacts/eval/latest.mp4
```

**Response:** `200 OK`
- Content-Type: `video/mp4`
- Content-Disposition: `inline; filename="eval_<timestamp>.mp4"`
- Cache-Control: `public, max-age=3600`

**Errors:**
- `400 Bad Request` — Invalid run_id format
- `403 Forbidden` — Access denied (path traversal attempt)
- `404 Not Found` — Video not found

---

### Get Evaluation Video (by Filename)

Serves a specific evaluation video by filename.

```
GET /runs/{run_id}/artifacts/eval/{filename}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `filename` | string | Video filename (format: `eval_YYYY-MM-DDTHH-MM-SS.mp4`) |

**Response:** `200 OK`
- Content-Type: `video/mp4`
- Content-Disposition: `inline; filename="{filename}"`
- Cache-Control: `public, max-age=3600`

**Errors:**
- `400 Bad Request` — Invalid run_id or filename format
- `403 Forbidden` — Access denied (path traversal attempt)
- `404 Not Found` — Video not found

---

### Get Evaluation Summary (Artifact Alias)

Returns the latest evaluation summary. This is an alias for `GET /runs/{run_id}/evaluate/latest`.

```
GET /runs/{run_id}/artifacts/eval-summary
```

**Response:** `200 OK`

```json
{
  "num_episodes": 5,
  "mean_reward": 204.2,
  "std_reward": 45.8,
  "min_reward": 112.5,
  "max_reward": 267.3,
  "mean_length": 302,
  "std_length": 58,
  "termination_rate": 0.8,
  "video_path": "/path/to/runs/<id>/eval/eval_2026-01-29T11-03-00.mp4",
  "timestamp": "2026-01-29T11:03:00.000Z"
}
```

**Errors:**
- `400 Bad Request` — Invalid run_id format
- `404 Not Found` — Run or evaluation summary not found

---

### List Events

Returns event log entries for a run.

```
GET /runs/{run_id}/events
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 50 | Max results (1-500) |
| `offset` | int | 0 | Pagination offset |
| `event_type` | string | — | Filter by event type |

**Response:** `200 OK`

```json
{
  "events": [
    {
      "id": 1,
      "timestamp": "2026-01-29T10:00:00.000Z",
      "event_type": "training_started",
      "message": "Training started with PPO on LunarLander-v2",
      "metadata": null
    },
    {
      "id": 2,
      "timestamp": "2026-01-29T10:05:00.000Z",
      "event_type": "checkpoint_saved",
      "message": "Checkpoint saved at timestep 50000",
      "metadata": {"timestep": 50000, "mean_reward": 45.2}
    }
  ],
  "total": 15
}
```

---

## Streaming (SSE)

### Stream Metrics

Server-Sent Events stream for real-time metrics updates.

```
GET /runs/{run_id}/stream/metrics
```

**Headers:**
```
Accept: text/event-stream
Last-Event-ID: <episode_number>  (optional, for reconnection)
```

**SSE Events:**

```
event: metrics
id: 42
data: {"episode":42,"reward":145.2,"length":289,"loss":0.0123,"fps":156,"timestamp":"2026-01-29T10:05:00.000Z"}

event: metrics
id: 43
data: {"episode":43,"reward":152.8,"length":301,"loss":0.0118,"fps":158,"timestamp":"2026-01-29T10:05:02.000Z"}

event: training_complete
data: {"final_episode":100,"total_timesteps":1000000,"status":"completed"}

event: error
data: {"code":"training_failed","message":"CUDA out of memory"}
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `metrics` | New episode metrics (max 4/second) |
| `training_complete` | Training finished |
| `training_stopped` | Training stopped by user |
| `error` | Error occurred |
| `heartbeat` | Keepalive (every 30s) |

**Throttling:** Maximum 4 updates per second. If metrics arrive faster, only the latest is sent.

**Reconnection:** Client can send `Last-Event-ID` header with the last received episode number to resume from that point.

---

### Stream Events

Server-Sent Events stream for real-time event log updates.

```
GET /runs/{run_id}/stream/events
```

**Headers:**
```
Accept: text/event-stream
Last-Event-ID: <event_id>  (optional, for reconnection)
```

**SSE Events:**

```
event: event
id: 5
data: {"id":5,"timestamp":"2026-01-29T10:05:00.000Z","event_type":"checkpoint_saved","message":"Checkpoint saved at timestep 50000","metadata":{"timestep":50000}}

event: event
id: 6
data: {"id":6,"timestamp":"2026-01-29T10:06:00.000Z","event_type":"warning","message":"High variance detected in recent episodes","metadata":{"variance":125.4}}
```

---

## Live Frames (WebSocket)

WebSocket endpoint for streaming live environment render frames during training or evaluation.

### Connect

```
WS /runs/{run_id}/ws/frames
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fps` | int | 15 | Target frame rate (1-30) |
| `quality` | int | 75 | JPEG quality (1-100) |

### Server → Client Messages

**Frame Message:**

```json
{
  "type": "frame",
  "data": "<base64-encoded-jpeg>",
  "timestamp": "2026-01-29T10:05:00.123Z",
  "episode": 42,
  "step": 156,
  "reward": 12.5,
  "total_reward": 145.2
}
```

**Status Message:**

```json
{
  "type": "status",
  "status": "training",
  "episode": 42,
  "timestep": 50000
}
```

**Error Message:**

```json
{
  "type": "error",
  "code": "stream_unavailable",
  "message": "Frame streaming not available for this run"
}
```

**End Message:**

```json
{
  "type": "end",
  "reason": "training_complete"
}
```

### Client → Server Messages

**Control Message:**

```json
{
  "type": "control",
  "action": "pause" | "resume" | "set_fps",
  "value": 10
}
```

### Frame Streaming Notes

- Frames are JPEG-encoded, base64 for transport
- Training mode: Target 10-15 fps (configurable)
- Evaluation mode: Target 15-30 fps for smoother playback
- Frames are dropped if client can't keep up
- Connection closes automatically when training/eval ends

---

## Error Handling

### Error Response Format

All errors return a consistent JSON format:

```json
{
  "error": {
    "code": "not_found",
    "message": "Run not found",
    "details": {
      "run_id": "invalid-uuid"
    }
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `bad_request` | Malformed request |
| 400 | `invalid_env_id` | Unknown environment |
| 400 | `invalid_algorithm` | Unknown or unsupported algorithm |
| 400 | `algorithm_not_supported` | Algorithm not supported for environment |
| 404 | `not_found` | Resource not found |
| 409 | `conflict` | Invalid state transition |
| 409 | `already_running` | Training already in progress |
| 409 | `not_running` | Cannot stop—not running |
| 409 | `no_model` | No trained model for evaluation |
| 422 | `validation_error` | Invalid hyperparameters |
| 500 | `internal_error` | Server error |
| 503 | `service_unavailable` | Backend overloaded |

---

## Status Transitions

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌─────────┐
│ pending │───►│ training │───►│ completed │    │ stopped │
└─────────┘    └──────────┘    └───────────┘    └─────────┘
                    │                                 ▲
                    │                                 │
                    └─────────────────────────────────┘
                    │
                    │         ┌────────────┐
                    └────────►│   failed   │
                              └────────────┘

From completed/stopped:
┌───────────┐    ┌────────────┐    ┌───────────┐
│ completed │───►│ evaluating │───►│ completed │
│  stopped  │    └────────────┘    │  stopped  │
└───────────┘                      └───────────┘
```

### Valid Transitions

| From | To | Trigger |
|------|----|---------|
| `pending` | `training` | `POST /runs/{id}/start` |
| `training` | `completed` | Training finishes |
| `training` | `stopped` | `POST /runs/{id}/stop` |
| `training` | `failed` | Error during training |
| `completed` | `evaluating` | `POST /runs/{id}/evaluate` |
| `stopped` | `evaluating` | `POST /runs/{id}/evaluate` |
| `evaluating` | `completed` | Evaluation finishes (from completed) |
| `evaluating` | `stopped` | Evaluation finishes (from stopped) |

---

## Health Check

```
GET /health
```

**Response:** `200 OK`

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-01-29T10:00:00.000Z"
}
```

---

## Example Usage

### cURL: Create and Start Training

```bash
# Create a run
curl -X POST http://localhost:8000/api/v1/runs \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "LunarLander-v2",
    "algorithm": "PPO",
    "hyperparameters": {
      "learning_rate": 0.0003,
      "total_timesteps": 100000
    }
  }'

# Start training
curl -X POST http://localhost:8000/api/v1/runs/{run_id}/start

# Stream metrics
curl -N http://localhost:8000/api/v1/runs/{run_id}/stream/metrics \
  -H "Accept: text/event-stream"
```

### cURL: Trigger Evaluation

```bash
# Start evaluation
curl -X POST http://localhost:8000/api/v1/runs/{run_id}/evaluate \
  -H "Content-Type: application/json" \
  -d '{"n_episodes": 5, "render": true}'

# Get evaluation results
curl http://localhost:8000/api/v1/runs/{run_id}/evaluation
```

### WebSocket: Stream Frames (wscat)

```bash
wscat -c "ws://localhost:8000/api/v1/runs/{run_id}/ws/frames?fps=15"
```
