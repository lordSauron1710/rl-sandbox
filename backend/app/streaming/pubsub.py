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
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set


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


@dataclass(frozen=True)
class Subscriber:
    """Subscriber queue + owning event loop for thread-safe delivery."""
    queue: asyncio.Queue
    loop: asyncio.AbstractEventLoop


class BasePubSub:
    """Base class for pub/sub systems."""

    def __init__(self):
        self._subscribers: Dict[str, Set[Subscriber]] = defaultdict(set)
        self._lock = threading.Lock()

    def subscribe(self, run_id: str) -> asyncio.Queue:
        """Subscribe to updates for a run."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        subscriber = Subscriber(queue=q, loop=asyncio.get_running_loop())
        with self._lock:
            self._subscribers[run_id].add(subscriber)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        """Unsubscribe from updates."""
        with self._lock:
            subscribers = self._subscribers.get(run_id)
            if not subscribers:
                return
            subscribers_to_remove = {s for s in subscribers if s.queue is q}
            subscribers.difference_update(subscribers_to_remove)
            if not subscribers:
                del self._subscribers[run_id]

    @staticmethod
    def _enqueue(q: asyncio.Queue, message: Any) -> None:
        """Push a message into a queue without blocking (drop oldest on overflow)."""
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(message)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    def publish(self, run_id: str, message: Any) -> None:
        """Publish from any thread using each subscriber loop safely."""
        with self._lock:
            subscribers = list(self._subscribers.get(run_id, set()))
        stale_subscribers: list[Subscriber] = []
        for subscriber in subscribers:
            if subscriber.loop.is_closed():
                stale_subscribers.append(subscriber)
                continue
            try:
                subscriber.loop.call_soon_threadsafe(
                    self._enqueue,
                    subscriber.queue,
                    message,
                )
            except RuntimeError:
                stale_subscribers.append(subscriber)

        if stale_subscribers:
            with self._lock:
                live_subscribers = self._subscribers.get(run_id)
                if not live_subscribers:
                    return
                for stale in stale_subscribers:
                    live_subscribers.discard(stale)
                if not live_subscribers:
                    del self._subscribers[run_id]

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

    def publish_training_complete(
        self,
        run_id: str,
        final_episode: int,
        total_timesteps: int,
        status: str,
    ) -> None:
        """Publish training completion event."""
        self.flush_pending(run_id)
        event_type = "training_stopped" if status == "stopped" else "training_complete"
        msg = {
            "type": event_type,
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

        # Coerce potential numpy scalar metadata into native Python numbers so
        # WebSocket JSON serialization never fails.
        try:
            episode_value = int(episode)
        except (TypeError, ValueError):
            episode_value = 0
        try:
            step_value = int(step)
        except (TypeError, ValueError):
            step_value = 0
        try:
            reward_value = float(reward)
        except (TypeError, ValueError):
            reward_value = 0.0
        try:
            total_reward_value = float(total_reward)
        except (TypeError, ValueError):
            total_reward_value = 0.0

        msg = FrameMessage(
            data=frame_data,
            timestamp=timestamp,
            episode=episode_value,
            step=step_value,
            reward=reward_value,
            total_reward=total_reward_value,
        )
        self.publish(run_id, msg)
        self._last_frame_time[run_id] = current_time

    def publish_status(self, run_id: str, status: str, episode: int, timestep: int) -> None:
        """Publish a status update."""
        msg = {
            "type": "status",
            "status": status,
            "episode": int(episode),
            "timestep": int(timestep),
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
