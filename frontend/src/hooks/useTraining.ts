'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ApiRun,
  RunConfig,
  createRun,
  getRun,
  startTraining,
  stopTraining,
  triggerEvaluation,
} from '@/services/api'

export interface CreateAndStartOptions {
  /** Called immediately after the run is created and before training starts. Use to connect streams so the live feed gets frames from the first step. If it returns a Promise, training will not start until it resolves (e.g. wait for WebSocket open). */
  onRunCreated?: (run: ApiRun) => void | Promise<void>
}

export interface UseTrainingResult {
  currentRun: ApiRun | null
  isCreating: boolean
  isStarting: boolean
  isStopping: boolean
  isEvaluating: boolean
  error: Error | null
  createAndStartTraining: (config: RunConfig, options?: CreateAndStartOptions) => Promise<void>
  stop: () => Promise<void>
  evaluate: (nEpisodes?: number) => Promise<void>
  refreshRun: () => Promise<void>
  clearCurrentRun: () => void
  clearError: () => void
}

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback)
}

/**
 * Hook to manage training operations
 */
export function useTraining(): UseTrainingResult {
  const [currentRun, setCurrentRun] = useState<ApiRun | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createAndStartTraining = useCallback(async (config: RunConfig, options?: CreateAndStartOptions) => {
    setError(null)
    setIsCreating(true)
    
    try {
      // Create the run
      const run = await createRun(config)
      setCurrentRun(run)
      setIsCreating(false)
      // Callback so caller can connect streams before training starts (ensures live feed gets frames from step 1).
      // Await so we only start training after streams are connected (e.g. WebSocket open).
      await Promise.resolve(options?.onRunCreated?.(run))
      
      // Start training
      setIsStarting(true)
      await startTraining(run.id)
      setCurrentRun(prev => prev ? { ...prev, status: 'training' } : null)
    } catch (err) {
      const error = toError(err, 'Failed to start training')
      setError(error)
      throw error
    } finally {
      setIsCreating(false)
      setIsStarting(false)
    }
  }, [])

  const stop = useCallback(async () => {
    if (!currentRun) return
    
    setError(null)
    setIsStopping(true)
    
    try {
      await stopTraining(currentRun.id)
      setCurrentRun(prev => prev ? { ...prev, status: 'stopped' } : null)
    } catch (err) {
      const error = toError(err, 'Failed to stop training')
      setError(error)
      throw error
    } finally {
      setIsStopping(false)
    }
  }, [currentRun])

  const evaluate = useCallback(async (nEpisodes: number = 10) => {
    if (!currentRun) return
    
    setError(null)
    setIsEvaluating(true)
    
    try {
      await triggerEvaluation(currentRun.id, nEpisodes)
      setCurrentRun(prev => prev ? { ...prev, status: 'evaluating' } : null)
    } catch (err) {
      const error = toError(err, 'Failed to start evaluation')
      setError(error)
      throw error
    } finally {
      setIsEvaluating(false)
    }
  }, [currentRun])

  const refreshRun = useCallback(async () => {
    if (!currentRun) return
    try {
      const nextRun = await getRun(currentRun.id)
      setCurrentRun(nextRun)
    } catch (err) {
      const error = toError(err, 'Failed to refresh run')
      setError(error)
      throw error
    }
  }, [currentRun])

  useEffect(() => {
    if (!currentRun) return
    if (!['pending', 'training', 'evaluating'].includes(currentRun.status)) return
    const runId = currentRun.id

    const interval = window.setInterval(async () => {
      try {
        const nextRun = await getRun(runId)
        setCurrentRun(nextRun)
      } catch {
        // Keep existing state and continue polling.
      }
    }, 2000)

    return () => {
      window.clearInterval(interval)
    }
  }, [currentRun?.id, currentRun?.status])

  const clearCurrentRun = useCallback(() => {
    setCurrentRun(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    currentRun,
    isCreating,
    isStarting,
    isStopping,
    isEvaluating,
    error,
    createAndStartTraining,
    stop,
    evaluate,
    refreshRun,
    clearCurrentRun,
    clearError,
  }
}
