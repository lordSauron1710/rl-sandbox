"""
Training runner for Stable-Baselines3 models.

This module handles:
- Creating Gymnasium environments
- Initializing SB3 models (PPO, DQN)
- Running training with custom callbacks
- Saving model checkpoints
"""
from typing import Optional, Callable, Any, Dict

import gymnasium as gym
from stable_baselines3 import PPO, DQN
from stable_baselines3.common.callbacks import CallbackList, CheckpointCallback

from app.models.environment import get_environment
from app.storage.run_storage import RunStorage
from app.training.callback import MetricsCallback


# Algorithm mapping
ALGORITHMS = {
    "PPO": PPO,
    "DQN": DQN,
}


class TrainingRunner:
    """
    Runs training for a single run.

    Handles environment creation, model initialization, and training execution.
    Thread-safe for use in background threads.
    """

    def __init__(
        self,
        run_id: str,
        env_id: str,
        algorithm: str,
        hyperparameters: Dict[str, Any],
        seed: Optional[int] = None,
        stop_flag: Optional[Callable[[], bool]] = None,
        on_progress: Optional[Callable[[int, int], None]] = None,
        verbose: int = 1,
    ):
        """
        Initialize the training runner.

        Args:
            run_id: Unique run identifier
            env_id: Gymnasium environment ID
            algorithm: Algorithm name (PPO or DQN)
            hyperparameters: Training hyperparameters
            seed: Random seed (optional)
            stop_flag: Callable that returns True to stop training
            on_progress: Progress callback (current_timestep, total_timesteps)
            verbose: Verbosity level (0=silent, 1=info, 2=debug)
        """
        self.run_id = run_id
        self.env_id = env_id
        self.algorithm = algorithm
        self.hyperparameters = hyperparameters
        self.seed = seed
        self.stop_flag = stop_flag or (lambda: False)
        self.on_progress = on_progress
        self.verbose = verbose

        self.storage = RunStorage(run_id)
        self.env: Optional[gym.Env] = None
        self.model: Optional[PPO | DQN] = None

        # Validate algorithm
        if algorithm not in ALGORITHMS:
            raise ValueError(
                f"Unsupported algorithm: {algorithm}. "
                f"Supported: {list(ALGORITHMS.keys())}"
            )

        # Validate environment
        env_meta = get_environment(env_id)
        if not env_meta:
            raise ValueError(f"Unknown environment: {env_id}")

        # Validate algorithm-environment compatibility
        if algorithm == "DQN" and env_meta.action_space_type != "Discrete":
            raise ValueError(
                f"DQN only supports discrete action spaces. "
                f"{env_id} has {env_meta.action_space_type} actions."
            )

    def _create_env(self) -> gym.Env:
        """Create and configure the Gymnasium environment."""
        env = gym.make(self.env_id)
        if self.seed is not None:
            env.reset(seed=self.seed)
        return env

    def _create_model(self, env: gym.Env) -> PPO | DQN:
        """Create and configure the SB3 model."""
        algo_class = ALGORITHMS[self.algorithm]

        # Extract hyperparameters
        learning_rate = self.hyperparameters.get("learning_rate", 0.0003)

        # Common kwargs
        model_kwargs: Dict[str, Any] = {
            "policy": "MlpPolicy",
            "env": env,
            "learning_rate": learning_rate,
            "verbose": self.verbose,
            "seed": self.seed,
        }

        # Algorithm-specific parameters
        if self.algorithm == "PPO":
            model_kwargs.update({
                "n_steps": self.hyperparameters.get("n_steps", 2048),
                "batch_size": self.hyperparameters.get("batch_size", 64),
                "gamma": self.hyperparameters.get("gamma", 0.99),
            })
        elif self.algorithm == "DQN":
            model_kwargs.update({
                "buffer_size": self.hyperparameters.get("buffer_size", 100000),
                "exploration_fraction": self.hyperparameters.get(
                    "exploration_fraction", 0.1
                ),
                "exploration_final_eps": self.hyperparameters.get(
                    "exploration_final_eps", 0.05
                ),
                "batch_size": self.hyperparameters.get("batch_size", 64),
                "gamma": self.hyperparameters.get("gamma", 0.99),
            })

        return algo_class(**model_kwargs)

    def run(self) -> Dict[str, Any]:
        """
        Execute training.

        Returns:
            Dictionary with training results:
            {
                "success": bool,
                "episodes": int,
                "timesteps": int,
                "mean_reward": float,
                "stopped": bool,  # True if stopped early
                "error": str | None
            }
        """
        total_timesteps = self.hyperparameters.get("total_timesteps", 1000000)

        try:
            if self.verbose > 0:
                print(f"[TrainingRunner] Starting training for run {self.run_id}")
                print(f"[TrainingRunner] Env: {self.env_id}, "
                      f"Algo: {self.algorithm}, Steps: {total_timesteps}")

            # Create environment
            self.env = self._create_env()

            # Create model
            self.model = self._create_model(self.env)

            # Create callbacks
            metrics_callback = MetricsCallback(
                run_id=self.run_id,
                total_timesteps=total_timesteps,
                stop_flag=self.stop_flag,
                on_progress=self.on_progress,
                log_interval=1,  # Log every episode
                verbose=self.verbose,
            )

            # Checkpoint callback - save every 10% of training
            checkpoint_freq = max(total_timesteps // 10, 10000)
            checkpoint_callback = CheckpointCallback(
                save_freq=checkpoint_freq,
                save_path=str(self.storage.model_dir),
                name_prefix="checkpoint",
                verbose=self.verbose,
            )

            callback_list = CallbackList([metrics_callback, checkpoint_callback])

            # Run training
            self.model.learn(
                total_timesteps=total_timesteps,
                callback=callback_list,
                progress_bar=False,  # We handle progress ourselves
            )

            # Check if stopped early
            was_stopped = self.stop_flag()

            # Save final model
            final_model_path = self.storage.get_checkpoint_path("latest")
            self.model.save(str(final_model_path).replace(".zip", ""))

            # Get summary
            summary = metrics_callback.get_summary()

            if self.verbose > 0:
                print(f"[TrainingRunner] Training completed. "
                      f"Episodes: {summary['episode_count']}, "
                      f"Mean reward: {summary['mean_reward']:.2f}")

            return {
                "success": True,
                "episodes": summary["episode_count"],
                "timesteps": summary["total_timesteps"],
                "mean_reward": summary["mean_reward"],
                "stopped": was_stopped,
                "error": None,
            }

        except Exception as e:
            error_msg = str(e)
            if self.verbose > 0:
                print(f"[TrainingRunner] Training failed: {error_msg}")

            return {
                "success": False,
                "episodes": 0,
                "timesteps": 0,
                "mean_reward": 0.0,
                "stopped": False,
                "error": error_msg,
            }

        finally:
            # Cleanup
            if self.env is not None:
                try:
                    self.env.close()
                except Exception:
                    pass
                self.env = None
