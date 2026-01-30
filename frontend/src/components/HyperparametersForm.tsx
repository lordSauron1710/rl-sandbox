'use client'

interface HyperparametersFormProps {
  algorithm: string
  onAlgorithmChange: (algorithm: string) => void
  learningRate: string
  onLearningRateChange: (rate: string) => void
  totalTimesteps: string
  onTotalTimestepsChange: (timesteps: string) => void
  supportedAlgorithms: string[]
  disabled?: boolean
  showDQNHint?: boolean
}

/**
 * Hyperparameters configuration form
 * 
 * Allows setting:
 * - Algorithm (PPO / DQN)
 * - Learning Rate (default: 0.0003)
 * - Total Timesteps (default: 1,000,000)
 */
export function HyperparametersForm({
  algorithm,
  onAlgorithmChange,
  learningRate,
  onLearningRateChange,
  totalTimesteps,
  onTotalTimestepsChange,
  supportedAlgorithms,
  disabled = false,
  showDQNHint = false,
}: HyperparametersFormProps) {
  const isDQNAvailable = supportedAlgorithms.includes('DQN')

  return (
    <div className="flex flex-col gap-4">
      {/* Algorithm */}
      <div>
        <label className="label">Algorithm</label>
        <select
          className="input"
          value={algorithm}
          onChange={(e) => onAlgorithmChange(e.target.value)}
          disabled={disabled}
        >
          <option value="PPO">PPO (Proximal Policy)</option>
          {isDQNAvailable && (
            <option value="DQN">DQN (Deep Q-Network)</option>
          )}
        </select>
        {showDQNHint && !isDQNAvailable && (
          <p className="text-[9px] text-text-secondary mt-1">
            DQN not available for continuous action spaces
          </p>
        )}
      </div>

      {/* Learning Rate */}
      <div>
        <label className="label">Learning Rate</label>
        <input
          type="number"
          className="input"
          value={learningRate}
          step="0.0001"
          min="0.000001"
          max="1"
          onChange={(e) => onLearningRateChange(e.target.value)}
          disabled={disabled}
          placeholder="0.0003"
        />
      </div>

      {/* Total Timesteps */}
      <div>
        <label className="label">Total Timesteps</label>
        <input
          type="text"
          className="input"
          value={totalTimesteps}
          placeholder="1,000,000"
          onChange={(e) => onTotalTimestepsChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
