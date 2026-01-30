'use client'

import { useState, useCallback } from 'react'
import { createRun, startTraining, stopTraining, triggerEvaluation, ApiRun, RunConfig } from '@/services/api'

export interface UseTrainingResult {
  currentRun: ApiRun | null
  isCreating: boolean
  isStarting: boolean
  isStopping: boolean
  isEvaluating: boolean
  error: Error | null
  createAndStartTraining: (config: RunConfig) => Promise<void>
  stop: () => Promise<void>
  evaluate: (nEpisodes?: number) => Promise<void>
  clearError: () => void
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

  const createAndStartTraining = useCallback(async (config: RunConfig) => {
    setError(null)
    setIsCreating(true)
    
    try {
      // Create the run
      const run = await createRun(config)
      setCurrentRun(run)
      setIsCreating(false)
      
      // Start training
      setIsStarting(true)
      await startTraining(run.id)
      setCurrentRun(prev => prev ? { ...prev, status: 'training' } : null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start training'))
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
      setError(err instanceof Error ? err : new Error('Failed to stop training'))
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
      setError(err instanceof Error ? err : new Error('Failed to start evaluation'))
    } finally {
      setIsEvaluating(false)
    }
  }, [currentRun])

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
    clearError,
  }
}
