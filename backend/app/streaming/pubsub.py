"""
Pub/Sub infrastructure for real-time streaming.

Provides thread-safe publish/subscribe mechanisms for:
- Metrics updates (throttled to max 4/second)
- Event log entries
- Rendered environment frames
"""
import asyncio
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Callable
import queue


@dataclass
class MetricMessage:
    """A metric update message."""
    episode: int
    reward: float
    length: int
    loss: Optional[float]
    fps: int
    timestep: int
    timestamp: str


@dataclass
class EventMessage:
    """An event message."""
    id: int
    timestamp: str
    event_type: str
    message: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class FrameMessage:
    """A rendered frame message."""
    data: str  # Base64 encoded JPEG/PNG
    timestamp: str
    episode: int
    step: int
    reward: float
    total_reward: float


class BasePubSub:
    """Base class for pub/sub systems."""

    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        self._lock = threading.Lock()

    def subscribe(self, run_id: str) -> asyncio.Queue:
        """Subscribe to updates for a run."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        with self._lock:
            self._subscribers[run_id].add(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        """Unsubscribe from updates."""
        with self._lock:
            self._subscribers[run_id].discard(q)
            if not self._subscribers[run_id]:
                del self._subscribers[run_id]

    async def _publish_async(self, run_id: str, message: Any) -> None:
        """Publish a message to all subscribers asynchronously."""
        with self._lock:
            queues = list(self._subscribers.get(run_id, []))

        for q in queues:
            try:
                # Non-blocking put, drop if full
                q.put_nowait(message)
            except asyncio.QueueFull:
                # Drop oldest message and add new one
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def publish(self, run_id: str, message: Any) -> None:
        """Publish a message from a sync context (schedules async publish)."""
        with self._lock:
            queues = list(self._subscribers.get(run_id, []))

        for q in queues:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def get_subscriber_count(self, run_id: str) -> int:
        """Get number of subscribers for a run."""
        with self._lock:
            return len(self._subscribers.get(run_id, set()))


class MetricsPubSub(BasePubSub):
    """
    Pub/Sub for metrics streaming with throttling.
    
    Throttles updates to max 4 per second per run.
    """

    def __init__(self):
        super().__init__()
        self._last_publish_time: Dict[str, float] = {}
        self._pending_metrics: Dict[str, MetricMessage] = {}
        self._throttle_interval = 0.25  # 4 updates per second

    def publish_metric(
        self,
        run_id: str,
        episode: int,
        reward: float,
        length: int,
        loss: Optional[float],
        fps: int,
        timestep: int,
        timestamp: Optional[str] = None,
    ) -> None:
        """
        Publish a metric update with throttling.
        
        If called too frequently, only the latest metric is kept
        and sent when the throttle interval elapses.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc).isoformat()

        msg = MetricMessage(
            episode=episode,
            reward=reward,
            length=length,
            loss=loss,
            fps=fps,
            timestep=timestep,
            timestamp=timestamp,
        )

        current_time = time.time()
        last_time = self._last_publish_time.get(run_id, 0)

        if current_time - last_time >= self._throttle_interval:
            # Can publish immediately
            self.publish(run_id, msg)
            self._last_publish_time[run_id] = current_time
            self._pending_metrics.pop(run_id, None)
        else:
            # Store as pending - will be sent on next eligible publish
            self._pending_metrics[run_id] = msg

    def flush_pending(self, run_id: str) -> None:
        """Flush any pending throttled metrics."""
        if run_id in self._pending_metrics:
            msg = self._pending_metrics.pop(run_id)
            self.publish(run_id, msg)
            self._last_publish_time[run_id] = time.time()

    def publish_training_complete(self, run_id: str, final_episode: int, 
                                   total_timesteps: int, status: str) -> None:
        """Publish training completion event."""
        self.flush_pending(run_id)
        msg = {
            "type": "training_complete",
            "final_episode": final_episode,
            "total_timesteps": total_timesteps,
            "status": status,
        }
        self.publish(run_id, msg)

    def publish_error(self, run_id: str, code: str, message: str) -> None:
        """Publish an error event."""
        msg = {
            "type": "error",
            "code": code,
            "message": message,
        }
        self.publish(run_id, msg)


class EventsPubSub(BasePubSub):
    """Pub/Sub for event log streaming."""

    def publish_event(
        self,
        run_id: str,
        event_id: int,
        timestamp: str,
        event_type: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Publish an event update."""
        msg = EventMessage(
            id=event_id,
            timestamp=timestamp,
            event_type=event_type,
            message=message,
            metadata=metadata,
        )
        self.publish(run_id, msg)


class FramesPubSub(BasePubSub):
    """
    Pub/Sub for rendered frame streaming.
    
    Supports frame rate limiting per subscriber.
    """

    def __init__(self):
        super().__init__()
        self._frame_intervals: Dict[str, float] = {}  # run_id -> target interval
        self._last_frame_time: Dict[str, float] = {}

    def set_target_fps(self, run_id: str, fps: int) -> None:
        """Set target FPS for a run's frame stream."""
        self._frame_intervals[run_id] = 1.0 / max(1, min(30, fps))

    def publish_frame(
        self,
        run_id: str,
        frame_data: str,
        episode: int,
        step: int,
        reward: float,
        total_reward: float,
        timestamp: Optional[str] = None,
    ) -> None:
        """
        Publish a frame with FPS limiting.
        """
        current_time = time.time()
        target_interval = self._frame_intervals.get(run_id, 1.0 / 15)  # Default 15 fps
        last_time = self._last_frame_time.get(run_id, 0)

        if current_time - last_time < target_interval:
            return  # Skip frame to maintain target FPS

        if timestamp is None:
            timestamp = datetime.now(timezone.utc).isoformat()

        msg = FrameMessage(
            data=frame_data,
            timestamp=timestamp,
            episode=episode,
            step=step,
            reward=reward,
            total_reward=total_reward,
        )
        self.publish(run_id, msg)
        self._last_frame_time[run_id] = current_time

    def publish_status(self, run_id: str, status: str, episode: int, timestep: int) -> None:
        """Publish a status update."""
        msg = {
            "type": "status",
            "status": status,
            "episode": episode,
            "timestep": timestep,
        }
        self.publish(run_id, msg)

    def publish_end(self, run_id: str, reason: str) -> None:
        """Publish stream end message."""
        msg = {
            "type": "end",
            "reason": reason,
        }
        self.publish(run_id, msg)

    def publish_error(self, run_id: str, code: str, message: str) -> None:
        """Publish an error message."""
        msg = {
            "type": "error",
            "code": code,
            "message": message,
        }
        self.publish(run_id, msg)


# Global singleton instances
_metrics_pubsub: Optional[MetricsPubSub] = None
_events_pubsub: Optional[EventsPubSub] = None
_frames_pubsub: Optional[FramesPubSub] = None
_instance_lock = threading.Lock()


def get_metrics_pubsub() -> MetricsPubSub:
    """Get the global metrics pub/sub instance."""
    global _metrics_pubsub
    if _metrics_pubsub is None:
        with _instance_lock:
            if _metrics_pubsub is None:
                _metrics_pubsub = MetricsPubSub()
    return _metrics_pubsub


def get_events_pubsub() -> EventsPubSub:
    """Get the global events pub/sub instance."""
    global _events_pubsub
    if _events_pubsub is None:
        with _instance_lock:
            if _events_pubsub is None:
                _events_pubsub = EventsPubSub()
    return _events_pubsub


def get_frames_pubsub() -> FramesPubSub:
    """Get the global frames pub/sub instance."""
    global _frames_pubsub
    if _frames_pubsub is None:
        with _instance_lock:
            if _frames_pubsub is None:
                _frames_pubsub = FramesPubSub()
    return _frames_pubsub
