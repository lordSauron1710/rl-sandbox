'use client'

import { PresetName, type AlgorithmName } from '@/services/api'

interface PresetOption {
  id: PresetName
  label: string
  description: string
}

interface HyperparametersFormProps {
  algorithm: AlgorithmName
  onAlgorithmChange: (algorithm: AlgorithmName) => void
  selectedPreset: PresetName
  onPresetChange: (preset: PresetName) => void
  presetOptions: PresetOption[]
  isLoadingPresets?: boolean
  presetsError?: string | null
  learningRate: string
  onLearningRateChange: (rate: string) => void
  totalTimesteps: string
  onTotalTimestepsChange: (timesteps: string) => void
  supportedAlgorithms: AlgorithmName[]
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
  selectedPreset,
  onPresetChange,
  presetOptions,
  isLoadingPresets = false,
  presetsError = null,
  learningRate,
  onLearningRateChange,
  totalTimesteps,
  onTotalTimestepsChange,
  supportedAlgorithms,
  disabled = false,
  showDQNHint = false,
}: HyperparametersFormProps) {
  const isDQNAvailable = supportedAlgorithms.includes('DQN')
  const selectedPresetMeta =
    presetOptions.find((preset) => preset.id === selectedPreset) ?? null
  const hasPresetOptions = presetOptions.length > 0
  const handleAlgorithmChange = (value: string) => {
    const nextAlgorithm: AlgorithmName = value === 'DQN' ? 'DQN' : 'PPO'
    onAlgorithmChange(nextAlgorithm)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Algorithm */}
      <div>
        <label className="label">Algorithm</label>
        <select
          className="input"
          value={algorithm}
          onChange={(e) => handleAlgorithmChange(e.target.value)}
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

      {/* Presets */}
      <div>
        <label className="label">Training Preset</label>
        {isLoadingPresets ? (
          <p className="text-[10px] text-text-secondary">Loading preset defaults...</p>
        ) : hasPresetOptions ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {presetOptions.map((preset) => {
                const isActive = preset.id === selectedPreset
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onPresetChange(preset.id)}
                    disabled={disabled}
                    className={`rounded border px-2 py-1.5 text-[10px] transition-colors ${
                      isActive
                        ? 'border-black bg-black text-white'
                        : 'border-border bg-white text-black hover:bg-surface-secondary'
                    }`}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-text-secondary mt-2">
              {selectedPresetMeta?.description ?? 'Preset selected'}
            </p>
            <p className="text-[9px] text-text-secondary mt-1">
              You can still adjust values below for fine-tuning.
            </p>
          </>
        ) : (
          <p className="text-[10px] text-text-secondary">
            Presets unavailable. Backend will use the default `stable` preset.
          </p>
        )}
        {presetsError && (
          <p className="text-[9px] text-red-600 mt-1">{presetsError}</p>
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
