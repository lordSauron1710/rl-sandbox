'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchEnvironments, ApiEnvironment } from '@/services/api'

export interface UseEnvironmentsResult {
  environments: ApiEnvironment[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch and manage environments from the backend
 */
export function useEnvironments(): UseEnvironmentsResult {
  const [environments, setEnvironments] = useState<ApiEnvironment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchEnvironments()
      setEnvironments(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch environments'))
      // Fallback to hardcoded environments if API fails
      setEnvironments([
        {
          id: 'LunarLander-v3',
          name: 'LunarLander-v3',
          display_id: 'ID:01',
          action_space_type: 'Discrete',
          action_space_size: 4,
          obs_space_type: 'Box',
          obs_space_dims: 8,
          description: 'Land a spacecraft on the moon',
          supported_algorithms: ['PPO', 'DQN'],
        },
        {
          id: 'CartPole-v1',
          name: 'CartPole-v1',
          display_id: 'ID:02',
          action_space_type: 'Discrete',
          action_space_size: 2,
          obs_space_type: 'Box',
          obs_space_dims: 4,
          description: 'Balance a pole on a cart',
          supported_algorithms: ['PPO', 'DQN'],
        },
        {
          id: 'BipedalWalker-v3',
          name: 'BipedalWalker-v3',
          display_id: 'ID:03',
          action_space_type: 'Continuous',
          action_space_size: 4,
          obs_space_type: 'Box',
          obs_space_dims: 24,
          description: 'Teach a robot to walk',
          supported_algorithms: ['PPO'],
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { environments, isLoading, error, refetch }
}
