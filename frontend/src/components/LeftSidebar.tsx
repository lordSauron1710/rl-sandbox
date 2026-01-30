'use client'

import { useState } from 'react'

export interface Environment {
  id: string
  name: string
  actionSpaceType: 'DISCRETE' | 'CONTINUOUS'
  obsSpaceDims: number
}

interface LeftSidebarProps {
  environments: Environment[]
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
  isTraining?: boolean
  isTesting?: boolean
}

export function LeftSidebar({
  environments,
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
  isTraining = false,
  isTesting = false,
}: LeftSidebarProps) {
  // Determine available algorithms based on selected environment
  const selectedEnv = environments.find((e) => e.id === selectedEnvId)
  const isDQNAvailable = selectedEnv?.actionSpaceType === 'DISCRETE'

  return (
    <div className="panel-card col w-[280px] flex-shrink-0">
      {/* Environment Select Header */}
      <div className="panel-header">
        <span className="label m-0">ENVIRONMENT SELECT</span>
      </div>

      {/* Environment Cards */}
      <div className="p-4 border-b border-border">
        {environments.map((env) => (
          <div
            key={env.id}
            className={`env-card ${selectedEnvId === env.id ? 'active' : ''}`}
            onClick={() => onSelectEnvironment(env.id)}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-semibold">{env.name}</span>
              <span className="label m-0 text-[9px]">
                ID:{env.id.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="label m-0">
              {env.actionSpaceType} / BOX({env.obsSpaceDims})
            </span>
          </div>
        ))}
      </div>

      {/* Hyperparameters Header */}
      <div className="panel-header border-t border-border">
        <span className="label m-0">HYPERPARAMETERS</span>
      </div>

      {/* Hyperparameters Form */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Algorithm */}
        <div className="mb-4">
          <label className="label">Algorithm</label>
          <select
            className="input"
            value={algorithm}
            onChange={(e) => onAlgorithmChange(e.target.value)}
          >
            <option value="PPO">PPO (Proximal Policy)</option>
            {isDQNAvailable && (
              <option value="DQN">DQN (Deep Q-Network)</option>
            )}
          </select>
        </div>

        {/* Learning Rate */}
        <div className="mb-4">
          <label className="label">Learning Rate</label>
          <input
            type="number"
            className="input"
            value={learningRate}
            step="0.0001"
            onChange={(e) => onLearningRateChange(e.target.value)}
          />
        </div>

        {/* Total Timesteps */}
        <div className="mb-4">
          <label className="label">Total Timesteps</label>
          <input
            type="text"
            className="input"
            value={totalTimesteps}
            onChange={(e) => onTotalTimestepsChange(e.target.value)}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            className="btn btn-primary py-3 text-xs"
            onClick={onTrain}
            disabled={isTraining || !selectedEnvId}
          >
            {isTraining ? 'Training...' : 'Train'}
          </button>
          <button
            className="btn btn-secondary py-3 text-xs"
            onClick={onTest}
            disabled={isTesting || !selectedEnvId}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
