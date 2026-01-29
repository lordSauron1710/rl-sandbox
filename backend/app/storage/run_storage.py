"""
Run storage utilities for managing run artifacts on disk.
"""
import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any

# Base directory for all runs
RUNS_DIR = Path(__file__).parent.parent.parent / "runs"

# Maximum number of evaluation videos to keep per run
MAX_EVAL_VIDEOS = 3


class RunStorage:
    """Manages on-disk storage for a single run."""
    
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.run_dir = RUNS_DIR / run_id
        self.model_dir = self.run_dir / "model"
        self.eval_dir = self.run_dir / "eval"
        
    def init_run_directory(self) -> None:
        """Create the run directory structure."""
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(exist_ok=True)
        self.eval_dir.mkdir(exist_ok=True)
        
    def save_config(self, config: Dict[str, Any]) -> None:
        """Save run configuration to config.json."""
        config_path = self.run_dir / "config.json"
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
            
    def load_config(self) -> Optional[Dict[str, Any]]:
        """Load run configuration from config.json."""
        config_path = self.run_dir / "config.json"
        if not config_path.exists():
            return None
        with open(config_path, "r") as f:
            return json.load(f)
    
    # --- Metrics ---
    
    def append_metric(self, metric: Dict[str, Any]) -> None:
        """Append a metric line to metrics.jsonl."""
        metrics_path = self.run_dir / "metrics.jsonl"
        with open(metrics_path, "a") as f:
            f.write(json.dumps(metric) + "\n")
            
    def get_metrics(self, tail: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Read metrics from metrics.jsonl.
        
        Args:
            tail: If provided, return only the last N metrics.
        """
        metrics_path = self.run_dir / "metrics.jsonl"
        if not metrics_path.exists():
            return []
        
        metrics = []
        with open(metrics_path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    metrics.append(json.loads(line))
        
        if tail is not None:
            return metrics[-tail:]
        return metrics
    
    def get_metrics_count(self) -> int:
        """Get the number of metric entries."""
        metrics_path = self.run_dir / "metrics.jsonl"
        if not metrics_path.exists():
            return 0
        with open(metrics_path, "r") as f:
            return sum(1 for line in f if line.strip())
    
    # --- Evaluation ---
    
    def save_eval_summary(self, summary: Dict[str, Any]) -> str:
        """
        Save evaluation summary to eval directory.
        Returns the filename.
        """
        timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S")
        filename = f"eval_{timestamp}.json"
        filepath = self.eval_dir / filename
        
        with open(filepath, "w") as f:
            json.dump(summary, f, indent=2)
        
        self._cleanup_old_evals()
        return filename
    
    def get_eval_video_path(self) -> Path:
        """Get path for a new evaluation video."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S")
        return self.eval_dir / f"eval_{timestamp}.mp4"
    
    def get_latest_eval(self) -> Optional[Dict[str, Any]]:
        """Get the latest evaluation summary."""
        eval_files = sorted(self.eval_dir.glob("eval_*.json"), reverse=True)
        if not eval_files:
            return None
        with open(eval_files[0], "r") as f:
            return json.load(f)
    
    def get_latest_eval_video(self) -> Optional[Path]:
        """Get path to the latest evaluation video."""
        video_files = sorted(self.eval_dir.glob("eval_*.mp4"), reverse=True)
        return video_files[0] if video_files else None
    
    def _cleanup_old_evals(self) -> None:
        """Remove old evaluation files, keeping only the latest K."""
        # Cleanup videos
        video_files = sorted(self.eval_dir.glob("eval_*.mp4"), reverse=True)
        for old_video in video_files[MAX_EVAL_VIDEOS:]:
            old_video.unlink()
        
        # Cleanup summaries
        json_files = sorted(self.eval_dir.glob("eval_*.json"), reverse=True)
        for old_json in json_files[MAX_EVAL_VIDEOS:]:
            old_json.unlink()
    
    # --- Model Checkpoints ---
    
    def get_checkpoint_path(self, checkpoint_type: str = "latest") -> Path:
        """Get path for a model checkpoint."""
        return self.model_dir / f"checkpoint_{checkpoint_type}.zip"
    
    def checkpoint_exists(self, checkpoint_type: str = "latest") -> bool:
        """Check if a checkpoint exists."""
        return self.get_checkpoint_path(checkpoint_type).exists()
    
    # --- Utilities ---
    
    def exists(self) -> bool:
        """Check if the run directory exists."""
        return self.run_dir.exists()
    
    def delete(self) -> None:
        """Delete the entire run directory."""
        import shutil
        if self.run_dir.exists():
            shutil.rmtree(self.run_dir)
    
    @staticmethod
    def list_all_runs() -> List[str]:
        """List all run IDs on disk."""
        if not RUNS_DIR.exists():
            return []
        return [d.name for d in RUNS_DIR.iterdir() if d.is_dir()]
