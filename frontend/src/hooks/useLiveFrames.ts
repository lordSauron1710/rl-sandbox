'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getFramesWebSocketUrl, FrameData } from '@/services/api'

export interface LiveFrameState {
  frameData: string | null  // base64 encoded image
  episode: number
  step: number
  reward: number
  totalReward: number
}

export interface UseLiveFramesResult {
  frame: LiveFrameState | null
  isConnected: boolean
  error: Error | null
  /** Connect to frame stream. Returns a Promise that resolves when the WebSocket is open (so caller can wait before starting training). */
  connect: (runId: string, fps?: number) => Promise<void>
  disconnect: () => void
  clear: () => void
  /** Clear error state (e.g. when caller decided not to block on connection failure). */
  clearError: () => void
  pause: () => void
  resume: () => void
  setFps: (fps: number) => void
}

/**
 * Hook to stream live environment frames via WebSocket
 */
export function useLiveFrames(): UseLiveFramesResult {
  const [frame, setFrame] = useState<LiveFrameState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const runIdRef = useRef<string | null>(null)
  const isPausedRef = useRef(false)

  const sendControl = useCallback((action: string, value?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'control',
        action,
        ...(value !== undefined && { value }),
      }))
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    runIdRef.current = null
    setIsConnected(false)
    isPausedRef.current = false
  }, [])

  const clear = useCallback(() => {
    setFrame(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const connect = useCallback((runId: string, fps: number = 15): Promise<void> => {
    // Already connected for this run — don't disconnect/reconnect (e.g. effect re-running)
    if (runIdRef.current === runId && wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    // Close any existing connection
    disconnect()

    setError(null)
    setFrame(null)

    return new Promise((resolve, reject) => {
      try {
        const url = getFramesWebSocketUrl(runId, fps)
        const ws = new WebSocket(url)
        wsRef.current = ws
        runIdRef.current = runId

        ws.onopen = () => {
          setIsConnected(true)
          setError(null)
          resolve()
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.type === 'frame') {
              const frameData = data as FrameData
              setFrame({
                frameData: frameData.data,
                episode: frameData.episode,
                step: frameData.step,
                reward: frameData.reward,
                totalReward: frameData.total_reward,
              })
            } else if (data.type === 'status') {
              // Initial status update
            } else if (data.type === 'end') {
              disconnect()
            } else if (data.type === 'error') {
              setError(new Error(data.message || 'Stream error'))
            }
          } catch (e) {
            console.error('[useLiveFrames] Failed to parse WebSocket message:', e)
          }
        }

        ws.onerror = () => {
          setError(new Error('WebSocket connection error'))
          reject(new Error('WebSocket connection error'))
        }

        ws.onclose = (event) => {
          runIdRef.current = null
          setIsConnected(false)
          if (event.code !== 1000 && event.code !== 1001) {
            setError(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`))
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Failed to connect'))
        setIsConnected(false)
        reject(e instanceof Error ? e : new Error('Failed to connect'))
      }
    })
  }, [disconnect])

  const pause = useCallback(() => {
    isPausedRef.current = true
    sendControl('pause')
  }, [sendControl])

  const resume = useCallback(() => {
    isPausedRef.current = false
    sendControl('resume')
  }, [sendControl])

  const setFps = useCallback((fps: number) => {
    sendControl('set_fps', fps)
  }, [sendControl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    frame,
    isConnected,
    error,
    connect,
    disconnect,
    clear,
    clearError,
    pause,
    resume,
    setFps,
  }
}
