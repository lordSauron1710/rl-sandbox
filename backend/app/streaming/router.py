"""
Streaming endpoints for SSE metrics/events and WebSocket frames.

Endpoints:
- GET /runs/{run_id}/stream/metrics - SSE metrics stream
- GET /runs/{run_id}/stream/events - SSE events stream
- WS /runs/{run_id}/ws/frames - WebSocket frame stream
"""
import asyncio
import json
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, Request, status
from fastapi.responses import StreamingResponse

from app.db import runs_repository, events_repository
from app.storage.run_storage import RunStorage
from app.streaming.pubsub import (
    get_metrics_pubsub,
    get_events_pubsub,
    get_frames_pubsub,
    MetricMessage,
    EventMessage,
    FrameMessage,
)

router = APIRouter(prefix="/runs", tags=["streaming"])


# ============================================================================
# SSE Metrics Stream
# ============================================================================

async def metrics_event_generator(
    run_id: str,
    last_event_id: Optional[int] = None,
):
    """
    Generate SSE events for metrics streaming.
    
    Yields:
        SSE-formatted events with metrics data
    """
    pubsub = get_metrics_pubsub()
    storage = RunStorage(run_id)
    
    # Send historical metrics if reconnecting
    if last_event_id is not None:
        metrics = storage.get_metrics()
        for metric in metrics:
            if metric.get("episode", 0) > last_event_id:
                data = json.dumps(metric)
                yield f"event: metrics\nid: {metric['episode']}\ndata: {data}\n\n"
    
    # Subscribe to real-time updates
    queue = pubsub.subscribe(run_id)
    
    try:
        # Send initial heartbeat
        yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
        
        heartbeat_interval = 30  # seconds
        last_heartbeat = asyncio.get_event_loop().time()
        
        while True:
            try:
                # Wait for message with timeout for heartbeat
                msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                
                if isinstance(msg, MetricMessage):
                    data = json.dumps(asdict(msg))
                    yield f"event: metrics\nid: {msg.episode}\ndata: {data}\n\n"
                elif isinstance(msg, dict):
                    # Special events (training_complete, error, etc.)
                    event_type = msg.get("type", "info")
                    data = json.dumps(msg)
                    yield f"event: {event_type}\ndata: {data}\n\n"
                    
                    # End stream on completion events
                    if event_type in ("training_complete", "training_stopped"):
                        break
                        
            except asyncio.TimeoutError:
                # Check if we need to send heartbeat
                current_time = asyncio.get_event_loop().time()
                if current_time - last_heartbeat >= heartbeat_interval:
                    yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
                    last_heartbeat = current_time
                
                # Check if run is still active
                run = runs_repository.get_run(run_id)
                if run and run["status"] not in ("training", "pending"):
                    # Training has ended
                    yield f"event: training_complete\ndata: {json.dumps({'status': run['status']})}\n\n"
                    break
                    
    finally:
        pubsub.unsubscribe(run_id, queue)


@router.get("/{run_id}/stream/metrics")
async def stream_metrics(
    request: Request,
    run_id: str,
):
    """
    Stream metrics updates via Server-Sent Events.
    
    Streams new metrics as they are appended during training.
    Throttled to max 4 updates per second.
    
    Headers:
    - Accept: text/event-stream
    - Last-Event-ID: <episode_number> (optional, for reconnection)
    
    Events:
    - metrics: New episode metrics
    - training_complete: Training finished
    - training_stopped: Training stopped by user
    - error: Error occurred
    - heartbeat: Keepalive (every 30s)
    """
    # Verify run exists
    run = runs_repository.get_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Run not found"}}
        )
    
    # Get last event ID from header for reconnection
    last_event_id = None
    last_event_header = request.headers.get("Last-Event-ID")
    if last_event_header:
        try:
            last_event_id = int(last_event_header)
        except ValueError:
            pass
    
    return StreamingResponse(
        metrics_event_generator(run_id, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ============================================================================
# SSE Events Stream
# ============================================================================

async def events_event_generator(
    run_id: str,
    last_event_id: Optional[int] = None,
):
    """
    Generate SSE events for event log streaming.
    """
    pubsub = get_events_pubsub()
    
    # Send historical events if reconnecting
    if last_event_id is not None:
        events = events_repository.get_events_after(run_id, after_id=last_event_id)
        for event in events:
            data = {
                "id": event["id"],
                "timestamp": event["timestamp"],
                "event_type": event["event_type"],
                "message": event["message"],
                "metadata": json.loads(event["metadata"]) if event["metadata"] else None,
            }
            yield f"event: event\nid: {event['id']}\ndata: {json.dumps(data)}\n\n"
    else:
        # Send recent events on initial connection
        events, _ = events_repository.list_events(run_id, limit=20)
        # Reverse to send oldest first
        for event in reversed(events):
            data = {
                "id": event["id"],
                "timestamp": event["timestamp"],
                "event_type": event["event_type"],
                "message": event["message"],
                "metadata": json.loads(event["metadata"]) if event["metadata"] else None,
            }
            yield f"event: event\nid: {event['id']}\ndata: {json.dumps(data)}\n\n"
    
    # Subscribe to real-time updates
    queue = pubsub.subscribe(run_id)
    
    try:
        heartbeat_interval = 30
        last_heartbeat = asyncio.get_event_loop().time()
        
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                
                if isinstance(msg, EventMessage):
                    data = asdict(msg)
                    yield f"event: event\nid: {msg.id}\ndata: {json.dumps(data)}\n\n"
                    
            except asyncio.TimeoutError:
                current_time = asyncio.get_event_loop().time()
                if current_time - last_heartbeat >= heartbeat_interval:
                    yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
                    last_heartbeat = current_time
                    
    finally:
        pubsub.unsubscribe(run_id, queue)


@router.get("/{run_id}/stream/events")
async def stream_events(
    request: Request,
    run_id: str,
):
    """
    Stream event log updates via Server-Sent Events.
    
    Streams new events as they are logged during training.
    
    Headers:
    - Accept: text/event-stream
    - Last-Event-ID: <event_id> (optional, for reconnection)
    
    Events:
    - event: New event log entry
    - heartbeat: Keepalive (every 30s)
    """
    # Verify run exists
    run = runs_repository.get_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Run not found"}}
        )
    
    last_event_id = None
    last_event_header = request.headers.get("Last-Event-ID")
    if last_event_header:
        try:
            last_event_id = int(last_event_header)
        except ValueError:
            pass
    
    return StreamingResponse(
        events_event_generator(run_id, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================================
# WebSocket Frames Stream
# ============================================================================

@router.websocket("/{run_id}/ws/frames")
async def websocket_frames(
    websocket: WebSocket,
    run_id: str,
    fps: int = 15,
    quality: int = 75,
):
    """
    Stream rendered environment frames via WebSocket.
    
    Query Parameters:
    - fps: Target frame rate (1-30, default: 15)
    - quality: JPEG quality (1-100, default: 75)
    
    Server -> Client Messages:
    - frame: Rendered frame with metadata
    - status: Training status update
    - error: Error message
    - end: Stream ended
    
    Client -> Server Messages:
    - control: {"action": "pause"|"resume"|"set_fps", "value": <int>}
    """
    # Validate query parameters
    fps = max(1, min(30, fps))
    quality = max(1, min(100, quality))
    
    # Verify run exists
    run = runs_repository.get_run(run_id)
    if not run:
        await websocket.close(code=4004, reason="Run not found")
        return
    
    await websocket.accept()
    
    pubsub = get_frames_pubsub()
    pubsub.set_target_fps(run_id, fps)
    queue = pubsub.subscribe(run_id)
    
    paused = False
    
    async def receive_messages():
        """Handle incoming client messages."""
        nonlocal paused, fps
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "control":
                    action = data.get("action")
                    if action == "pause":
                        paused = True
                    elif action == "resume":
                        paused = False
                    elif action == "set_fps":
                        new_fps = data.get("value", fps)
                        fps = max(1, min(30, new_fps))
                        pubsub.set_target_fps(run_id, fps)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
    
    # Start receiver task
    receiver_task = asyncio.create_task(receive_messages())
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "status",
            "status": run["status"],
            "episode": 0,
            "timestep": 0,
        })
        
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                
                if paused:
                    continue
                
                if isinstance(msg, FrameMessage):
                    await websocket.send_json({
                        "type": "frame",
                        "data": msg.data,
                        "timestamp": msg.timestamp,
                        "episode": msg.episode,
                        "step": msg.step,
                        "reward": msg.reward,
                        "total_reward": msg.total_reward,
                    })
                elif isinstance(msg, dict):
                    msg_type = msg.get("type")
                    await websocket.send_json(msg)
                    
                    if msg_type == "end":
                        break
                        
            except asyncio.TimeoutError:
                # Check if run is still active
                run = runs_repository.get_run(run_id)
                if run and run["status"] not in ("training", "evaluating"):
                    await websocket.send_json({
                        "type": "end",
                        "reason": f"run_{run['status']}",
                    })
                    break
                    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "code": "stream_error",
                "message": str(e),
            })
        except Exception:
            pass
    finally:
        receiver_task.cancel()
        pubsub.unsubscribe(run_id, queue)
        try:
            await websocket.close()
        except Exception:
            pass
