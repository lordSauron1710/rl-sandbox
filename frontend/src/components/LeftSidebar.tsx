'use client'

import { useEffect } from 'react'
import { ApiEnvironment, PresetName, type AlgorithmName } from '@/services/api'
import { EnvironmentCard, EnvironmentCardSkeleton } from './EnvironmentCard'
import { HyperparametersForm } from './HyperparametersForm'
import { LoadingButton } from './LoadingButton'

interface LeftSidebarProps {
  environments: ApiEnvironment[]
  isLoadingEnvironments?: boolean
  selectedEnvId: string | null
  onSelectEnvironment: (envId: string) => void
  algorithm: AlgorithmName
  onAlgorithmChange: (algorithm: AlgorithmName) => void
  selectedPreset: PresetName
  onPresetChange: (preset: PresetName) => void
  presetOptions: Array<{ id: PresetName; label: string; description: string }>
  isLoadingPresets?: boolean
  presetsError?: string | null
  learningRate: string
  onLearningRateChange: (rate: string) => void
  totalTimesteps: string
  onTotalTimestepsChange: (timesteps: string) => void
  onTrain: () => void
  onTest: () => void
  onStop: () => void
  isTraining?: boolean
  isTesting?: boolean
  isCreatingRun?: boolean
  isStoppingTraining?: boolean
  isStoppingTesting?: boolean
  trainingProgressPercent?: number
  testingProgressPercent?: number
  /** When true, TEST is disabled (no trained run available). */
  hasTrainedRun?: boolean
}

export function LeftSidebar({
  environments,
  isLoadingEnvironments = false,
  selectedEnvId,
  onSelectEnvironment,
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
  onTrain,
  onTest,
  onStop,
  isTraining = false,
  isTesting = false,
  isCreatingRun = false,
  isStoppingTraining = false,
  isStoppingTesting = false,
  trainingProgressPercent = 0,
  testingProgressPercent = 0,
  hasTrainedRun = false,
}: LeftSidebarProps) {
  // Determine available algorithms based on selected environment
  const selectedEnv = environments.find((e) => e.id === selectedEnvId)
  const supportedAlgorithms = (selectedEnv?.supported_algorithms || ['PPO']).filter(
    (candidate): candidate is AlgorithmName => candidate === 'PPO' || candidate === 'DQN'
  )

  // If current algorithm is not supported, switch to PPO
  const effectiveAlgorithm = supportedAlgorithms.includes(algorithm) ? algorithm : 'PPO'
  useEffect(() => {
    if (effectiveAlgorithm !== algorithm && selectedEnv) {
      onAlgorithmChange(effectiveAlgorithm)
    }
  }, [effectiveAlgorithm, algorithm, selectedEnv, onAlgorithmChange])

  const isOperationInProgress =
    isTraining || isTesting || isCreatingRun || isStoppingTraining || isStoppingTesting
  const trainProgressLabel = `${Math.max(0, Math.min(100, Math.round(trainingProgressPercent)))}%`
  const testProgressLabel = `${Math.max(0, Math.min(100, Math.round(testingProgressPercent)))}%`

  return (
    <div className="panel-card col w-[280px] flex-shrink-0">
      {/* Environment Select Header */}
      <div className="panel-header">
        <span className="label m-0">ENVIRONMENT SELECT</span>
      </div>

      {/* Environment Cards */}
      <div className="p-4 border-b border-border">
        {isLoadingEnvironments ? (
          <EnvironmentCardSkeleton count={3} />
        ) : (
          environments.map((env) => (
            <EnvironmentCard
              key={env.id}
              environment={env}
              isSelected={selectedEnvId === env.id}
              onSelect={onSelectEnvironment}
            />
          ))
        )}
      </div>

      {/* Hyperparameters Header */}
      <div className="panel-header border-t border-border">
        <span className="label m-0">HYPERPARAMETERS</span>
      </div>

      {/* Hyperparameters Form */}
      <div className="p-4 flex-1 flex flex-col">
        <HyperparametersForm
          algorithm={effectiveAlgorithm}
          onAlgorithmChange={onAlgorithmChange}
          selectedPreset={selectedPreset}
          onPresetChange={onPresetChange}
          presetOptions={presetOptions}
          isLoadingPresets={isLoadingPresets}
          presetsError={presetsError}
          learningRate={learningRate}
          onLearningRateChange={onLearningRateChange}
          totalTimesteps={totalTimesteps}
          onTotalTimestepsChange={onTotalTimestepsChange}
          supportedAlgorithms={supportedAlgorithms}
          disabled={isOperationInProgress}
          showDQNHint={selectedEnv?.action_space_type === 'Continuous'}
        />

        {/* Spacer */}
        <div className="flex-1 min-h-4" />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {isTraining ? (
            <LoadingButton
              variant="danger"
              className="py-3 text-xs"
              onClick={onStop}
              isLoading={isStoppingTraining}
              loadingText="Stopping..."
              progress={isStoppingTraining ? undefined : trainingProgressPercent}
              disabled={isStoppingTraining}
              title={`Training in progress (${trainProgressLabel})`}
            >
              {`STOP · ${trainProgressLabel}`}
            </LoadingButton>
          ) : (
            <LoadingButton
              variant="primary"
              className="py-3 text-xs"
              onClick={onTrain}
              isLoading={isCreatingRun}
              loadingText="Starting..."
              disabled={!selectedEnvId || isOperationInProgress}
            >
              TRAIN
            </LoadingButton>
          )}

          {isTesting ? (
            <LoadingButton
              variant="secondary"
              className="py-3 text-xs"
              onClick={onStop}
              isLoading={isStoppingTesting}
              loadingText="Stopping..."
              progress={isStoppingTesting ? undefined : testingProgressPercent}
              disabled={isStoppingTesting}
              title={`Evaluation in progress (${testProgressLabel})`}
            >
              {`STOP · ${testProgressLabel}`}
            </LoadingButton>
          ) : (
            <LoadingButton
              variant="secondary"
              className="py-3 text-xs"
              onClick={onTest}
              disabled={!selectedEnvId || isOperationInProgress || !hasTrainedRun}
              title={!hasTrainedRun ? 'Train first to get a model, then test' : undefined}
            >
              TEST
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  )
}

// Re-export Environment type for backwards compatibility
export type { ApiEnvironment as Environment } from '@/services/api'
