'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getMetricsStreamUrl, MetricsData } from '@/services/api'

export interface UseMetricsStreamResult {
  metrics: MetricsData | null
  rewardHistory: number[]
  isConnected: boolean
  error: Error | null
  connect: (runId: string) => void
  disconnect: () => void
  clear: () => void
}

/**
 * Hook to stream real-time metrics from a training run via SSE
 */
export function useMetricsStream(): UseMetricsStreamResult {
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [rewardHistory, setRewardHistory] = useState<number[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastEventIdRef = useRef<number | null>(null)

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  const clear = useCallback(() => {
    setMetrics(null)
    setRewardHistory([])
  }, [])

  const connect = useCallback((runId: string) => {
    // Close any existing connection
    disconnect()
    
    setError(null)
    
    try {
      const url = getMetricsStreamUrl(runId)
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        setIsConnected(true)
        setError(null)
      }
      
      eventSource.addEventListener('metrics', (event) => {
        try {
          const data: MetricsData = JSON.parse(event.data)
          lastEventIdRef.current = data.episode
          
          setMetrics(data)
          
          // Add to reward history (keep last 100)
          setRewardHistory(prev => {
            const newHistory = [...prev, data.reward]
            return newHistory.slice(-100)
          })
        } catch (e) {
          console.error('Failed to parse metrics:', e)
        }
      })
      
      eventSource.addEventListener('training_complete', (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Training complete:', data)
        } catch (e) {
          // Ignore parse errors for status events
        }
        disconnect()
      })
      
      eventSource.addEventListener('training_stopped', (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Training stopped:', data)
        } catch (e) {
          // Ignore parse errors for status events
        }
        disconnect()
      })
      
      eventSource.addEventListener('error', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data)
          setError(new Error(data.message || 'Stream error'))
        } catch {
          // Generic error
          setError(new Error('Connection error'))
        }
      })
      
      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsConnected(false)
          // Attempt reconnection could be added here
        }
      }
      
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to connect'))
      setIsConnected(false)
    }
  }, [disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    metrics,
    rewardHistory,
    isConnected,
    error,
    connect,
    disconnect,
    clear,
  }
}
