'use client'

import { useState } from 'react'
import { ApiEnvironment } from '@/services/api'
import { EnvironmentCard, EnvironmentCardSkeleton } from './EnvironmentCard'
import { HyperparametersForm } from './HyperparametersForm'
import { LoadingButton } from './LoadingButton'

interface LeftSidebarProps {
  environments: ApiEnvironment[]
  isLoadingEnvironments?: boolean
  selectedEnvId: string | null
  onSelectEnvironment: (envId: string) => void
  algorithm: string
  onAlgorithmChange: (algorithm: string) => void
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
  hasTrainedRun = false,
}: LeftSidebarProps) {
  // Determine available algorithms based on selected environment
  const selectedEnv = environments.find((e) => e.id === selectedEnvId)
  const supportedAlgorithms = selectedEnv?.supported_algorithms || ['PPO']
  const isDQNAvailable = supportedAlgorithms.includes('DQN')

  // If current algorithm is not supported, switch to PPO
  const effectiveAlgorithm = supportedAlgorithms.includes(algorithm) ? algorithm : 'PPO'
  if (effectiveAlgorithm !== algorithm && selectedEnv) {
    onAlgorithmChange(effectiveAlgorithm)
  }

  const isOperationInProgress = isTraining || isTesting || isCreatingRun

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
          {/* When training: show STOP as its own button. Otherwise show TRAIN. */}
          {isTraining && !isCreatingRun ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop training (abrupt)"
              className="btn bg-red-600 border-red-600 text-white hover:bg-red-700 transition-colors duration-200 py-3 text-xs rounded-full col-span-1"
            >
              STOP
            </button>
          ) : (
            <LoadingButton
              variant="primary"
              className="py-3 text-xs"
              onClick={onTrain}
              isLoading={isCreatingRun}
              loadingText="Creating..."
              disabled={!selectedEnvId || isOperationInProgress}
            >
              TRAIN
            </LoadingButton>
          )}
          
          <LoadingButton
            variant="secondary"
            className="py-3 text-xs"
            onClick={onTest}
            isLoading={isTesting}
            loadingText="Testing..."
            disabled={!selectedEnvId || isOperationInProgress || !hasTrainedRun}
            title={!hasTrainedRun ? 'Train first to get a model, then test' : undefined}
          >
            TEST
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}

// Re-export Environment type for backwards compatibility
export type { ApiEnvironment as Environment } from '@/services/api'
