"""
Evaluation runner for trained RL policies.

This module handles:
- Loading trained models from checkpoints
- Running evaluation episodes
- Recording MP4 videos using Gymnasium RecordVideo wrapper
- Streaming live frames during evaluation
- Collecting evaluation statistics
"""
import base64
import io
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import gymnasium as gym
from gymnasium.wrappers import RecordVideo
from PIL import Image
from stable_baselines3 import PPO, DQN

from app.storage.run_storage import RunStorage
from app.streaming.pubsub import get_frames_pubsub, get_metrics_pubsub


# Algorithm mapping
ALGORITHMS = {
    "PPO": PPO,
    "DQN": DQN,
}

# Default evaluation parameters
DEFAULT_NUM_EPISODES = 5
DEFAULT_TARGET_FPS = 30
DEFAULT_VIDEO_MAX_RESOLUTION = 720  # Max height in pixels


@dataclass
class EpisodeResult:
    """Result from a single evaluation episode."""
    episode_num: int
    total_reward: float
    episode_length: int
    terminated: bool  # Reached goal/terminal state
    truncated: bool   # Hit time limit
    info: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationSummary:
    """Summary statistics from evaluation run."""
    num_episodes: int
    mean_reward: float
    std_reward: float
    min_reward: float
    max_reward: float
    mean_length: float
    std_length: float
    termination_rate: float  # Fraction that terminated (vs truncated)
    episodes: List[EpisodeResult]
    video_path: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "num_episodes": self.num_episodes,
            "mean_reward": self.mean_reward,
            "std_reward": self.std_reward,
            "min_reward": self.min_reward,
            "max_reward": self.max_reward,
            "mean_length": self.mean_length,
            "std_length": self.std_length,
            "termination_rate": self.termination_rate,
            "video_path": self.video_path,
            "timestamp": self.timestamp,
            "episodes": [
                {
                    "episode_num": ep.episode_num,
                    "total_reward": ep.total_reward,
                    "episode_length": ep.episode_length,
                    "terminated": ep.terminated,
                    "truncated": ep.truncated,
                }
                for ep in self.episodes
            ],
        }


class EvaluationRunner:
    """
    Runs evaluation for a trained model.
    
    Handles environment creation, model loading, video recording,
    and live frame streaming.
    """

    def __init__(
        self,
        run_id: str,
        env_id: str,
        algorithm: str,
        num_episodes: int = DEFAULT_NUM_EPISODES,
        seed: Optional[int] = None,
        stop_flag: Optional[Callable[[], bool]] = None,
        stream_frames: bool = True,
        target_fps: int = DEFAULT_TARGET_FPS,
        verbose: int = 1,
    ):
        """
        Initialize the evaluation runner.

        Args:
            run_id: Unique run identifier
            env_id: Gymnasium environment ID
            algorithm: Algorithm name (PPO or DQN)
            num_episodes: Number of evaluation episodes
            seed: Random seed (optional)
            stop_flag: Callable that returns True to stop evaluation
            stream_frames: Whether to stream live frames
            target_fps: Target frames per second for streaming
            verbose: Verbosity level (0=silent, 1=info, 2=debug)
        """
        self.run_id = run_id
        self.env_id = env_id
        self.algorithm = algorithm
        self.num_episodes = num_episodes
        self.seed = seed
        self.stop_flag = stop_flag or (lambda: False)
        self.stream_frames = stream_frames
        self.target_fps = min(30, max(1, target_fps))  # Clamp to 1-30
        self.verbose = verbose

        self.storage = RunStorage(run_id)
        self.env: Optional[gym.Env] = None
        self.model: Optional[PPO | DQN] = None
        
        # Frame streaming
        self._frames_pubsub = get_frames_pubsub() if stream_frames else None
        self._frame_interval = 1.0 / self.target_fps
        self._last_frame_time = 0.0

        # Validate algorithm
        if algorithm not in ALGORITHMS:
            raise ValueError(
                f"Unsupported algorithm: {algorithm}. "
                f"Supported: {list(ALGORITHMS.keys())}"
            )

        # Verify checkpoint exists
        if not self.storage.checkpoint_exists("latest"):
            raise ValueError(
                f"No trained model found for run {run_id}. "
                "Please train the model first."
            )

    def _create_env(self, video_path: Optional[Path] = None) -> gym.Env:
        """
        Create and configure the Gymnasium environment.
        
        If video_path is provided, wraps with RecordVideo wrapper.
        """
        # Create base environment with rgb_array render mode for recording
        env = gym.make(self.env_id, render_mode="rgb_array")
        
        if self.seed is not None:
            env.reset(seed=self.seed)

        # Wrap with video recorder if path provided
        if video_path is not None:
            video_dir = video_path.parent
            video_name = video_path.stem  # Get filename without extension
            
            env = RecordVideo(
                env,
                video_folder=str(video_dir),
                name_prefix=video_name,
                episode_trigger=lambda ep: True,  # Record all episodes
            )

        return env

    def _load_model(self, env: gym.Env) -> PPO | DQN:
        """Load trained model from checkpoint."""
        algo_class = ALGORITHMS[self.algorithm]
        checkpoint_path = self.storage.get_checkpoint_path("latest")
        
        # Remove .zip extension if present (SB3 adds it)
        checkpoint_str = str(checkpoint_path)
        if checkpoint_str.endswith(".zip"):
            checkpoint_str = checkpoint_str[:-4]
        
        return algo_class.load(checkpoint_str, env=env)

    def _render_and_stream_frame(
        self,
        episode: int,
        step: int,
        reward: float,
        total_reward: float,
    ) -> None:
        """Render current frame and stream if enough time has passed."""
        if not self.stream_frames or self._frames_pubsub is None:
            return

        current_time = time.time()
        if current_time - self._last_frame_time < self._frame_interval:
            return  # Skip to maintain target FPS

        try:
            # Render frame from environment
            frame = self.env.render()
            if frame is None:
                return

            # Handle float 0-1 or uint8 0-255 from different envs
            if frame.dtype == np.floating:
                frame = (np.clip(frame, 0, 1) * 255).astype(np.uint8)
            elif frame.dtype != np.uint8:
                frame = np.asarray(frame, dtype=np.uint8)
            img = Image.fromarray(frame)
            
            # Resize if needed to stay under max resolution
            if img.height > DEFAULT_VIDEO_MAX_RESOLUTION:
                ratio = DEFAULT_VIDEO_MAX_RESOLUTION / img.height
                new_width = int(img.width * ratio)
                img = img.resize(
                    (new_width, DEFAULT_VIDEO_MAX_RESOLUTION),
                    Image.Resampling.LANCZOS,
                )

            # Encode to JPEG
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            frame_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

            # Publish frame
            self._frames_pubsub.publish_frame(
                run_id=self.run_id,
                frame_data=frame_data,
                episode=episode,
                step=step,
                reward=reward,
                total_reward=total_reward,
            )
            self._last_frame_time = current_time

        except Exception as e:
            if self.verbose > 1:
                print(f"[EvaluationRunner] Frame streaming error: {e}")

    def run(self) -> EvaluationSummary:
        """
        Execute evaluation.

        Returns:
            EvaluationSummary with statistics and episode results
        """
        episode_results: List[EpisodeResult] = []
        video_path = self.storage.get_eval_video_path()

        try:
            if self.verbose > 0:
                print(f"[EvaluationRunner] Starting eval for run {self.run_id}")
                print(f"[EvaluationRunner] Env: {self.env_id}, "
                      f"Episodes: {self.num_episodes}")

            # Create environment with video recording
            self.env = self._create_env(video_path)
            
            # Load trained model
            self.model = self._load_model(self.env)

            # Set streaming FPS if available
            if self._frames_pubsub:
                self._frames_pubsub.set_target_fps(self.run_id, self.target_fps)
                # Send initial status
                self._frames_pubsub.publish_status(
                    self.run_id, "evaluating", 0, 0
                )

            # Run evaluation episodes
            metrics_pubsub = get_metrics_pubsub()
            for ep_num in range(self.num_episodes):
                if self.stop_flag():
                    if self.verbose > 0:
                        print(f"[EvaluationRunner] Stopped at ep {ep_num}")
                    break

                result = self._run_episode(ep_num)
                episode_results.append(result)

                # Publish episode metric so frontend reward history updates during Test
                metrics_pubsub.publish_metric(
                    run_id=self.run_id,
                    episode=ep_num + 1,
                    reward=result.total_reward,
                    length=result.episode_length,
                    loss=None,
                    fps=0,
                    timestep=0,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )

                if self.verbose > 0:
                    print(f"[EvaluationRunner] Ep {ep_num + 1}/{self.num_episodes}: "
                          f"R={result.total_reward:.2f}, L={result.episode_length}")

            # Build summary
            summary = self._build_summary(episode_results, video_path)

            # Save summary to storage
            self.storage.save_eval_summary(summary.to_dict())

            if self.verbose > 0:
                print(f"[EvaluationRunner] Evaluation completed. "
                      f"Mean reward: {summary.mean_reward:.2f}")

            # Signal stream end
            if self._frames_pubsub:
                reason = "eval_complete" if not self.stop_flag() else "stopped"
                self._frames_pubsub.publish_end(self.run_id, reason)

            return summary

        except Exception as e:
            error_msg = str(e)
            if self.verbose > 0:
                print(f"[EvaluationRunner] Evaluation failed: {error_msg}")

            # Signal error to stream
            if self._frames_pubsub:
                self._frames_pubsub.publish_error(
                    self.run_id,
                    "evaluation_error",
                    error_msg,
                )

            raise

        finally:
            # Cleanup
            if self.env is not None:
                try:
                    self.env.close()
                except Exception:
                    pass
                self.env = None

    def _run_episode(self, episode_num: int) -> EpisodeResult:
        """Run a single evaluation episode."""
        obs, info = self.env.reset()
        
        total_reward = 0.0
        step = 0
        terminated = False
        truncated = False

        while not (terminated or truncated):
            if self.stop_flag():
                break

            # Get action from model (deterministic for evaluation)
            action, _ = self.model.predict(obs, deterministic=True)
            
            # Step environment
            obs, reward, terminated, truncated, info = self.env.step(action)
            total_reward += float(reward)
            step += 1

            # Stream frame
            self._render_and_stream_frame(
                episode=episode_num + 1,
                step=step,
                reward=float(reward),
                total_reward=total_reward,
            )

        return EpisodeResult(
            episode_num=episode_num + 1,
            total_reward=total_reward,
            episode_length=step,
            terminated=terminated,
            truncated=truncated,
            info=info,
        )

    def _build_summary(
        self,
        episodes: List[EpisodeResult],
        video_path: Path,
    ) -> EvaluationSummary:
        """Build evaluation summary from episode results."""
        import statistics

        if not episodes:
            return EvaluationSummary(
                num_episodes=0,
                mean_reward=0.0,
                std_reward=0.0,
                min_reward=0.0,
                max_reward=0.0,
                mean_length=0.0,
                std_length=0.0,
                termination_rate=0.0,
                episodes=[],
                video_path=None,
            )

        rewards = [ep.total_reward for ep in episodes]
        lengths = [ep.episode_length for ep in episodes]
        terminated_count = sum(1 for ep in episodes if ep.terminated)

        # Calculate std (handle single episode case)
        std_reward = statistics.stdev(rewards) if len(rewards) > 1 else 0.0
        std_length = statistics.stdev(lengths) if len(lengths) > 1 else 0.0

        # Find the actual video file created by RecordVideo
        # RecordVideo creates files like: {name_prefix}-episode-{ep}.mp4
        video_files = sorted(video_path.parent.glob(f"{video_path.stem}*.mp4"))
        actual_video_path = str(video_files[-1]) if video_files else None

        return EvaluationSummary(
            num_episodes=len(episodes),
            mean_reward=statistics.mean(rewards),
            std_reward=std_reward,
            min_reward=min(rewards),
            max_reward=max(rewards),
            mean_length=statistics.mean(lengths),
            std_length=std_length,
            termination_rate=terminated_count / len(episodes),
            episodes=episodes,
            video_path=actual_video_path,
        )
