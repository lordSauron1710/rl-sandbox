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
  connect: (runId: string, fps?: number) => void
  disconnect: () => void
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
    setIsConnected(false)
    isPausedRef.current = false
  }, [])

  const connect = useCallback((runId: string, fps: number = 15) => {
    // Close any existing connection
    disconnect()
    
    setError(null)
    setFrame(null)
    
    try {
      const url = getFramesWebSocketUrl(runId, fps)
      const ws = new WebSocket(url)
      wsRef.current = ws
      
      ws.onopen = () => {
        setIsConnected(true)
        setError(null)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'frame') {
            const frameData = data as FrameData
            console.log('[useLiveFrames] Received frame:', {
              episode: frameData.episode,
              step: frameData.step,
              dataLength: frameData.data?.length,
            })
            setFrame({
              frameData: frameData.data,
              episode: frameData.episode,
              step: frameData.step,
              reward: frameData.reward,
              totalReward: frameData.total_reward,
            })
          } else if (data.type === 'status') {
            // Initial status update
            console.log('[useLiveFrames] Frame stream status:', data)
          } else if (data.type === 'end') {
            console.log('[useLiveFrames] Frame stream ended:', data.reason)
            disconnect()
          } else if (data.type === 'error') {
            console.log('[useLiveFrames] Frame stream error:', data)
            setError(new Error(data.message || 'Stream error'))
          }
        } catch (e) {
          console.error('[useLiveFrames] Failed to parse WebSocket message:', e)
        }
      }
      
      ws.onerror = () => {
        setError(new Error('WebSocket connection error'))
      }
      
      ws.onclose = (event) => {
        setIsConnected(false)
        if (event.code !== 1000 && event.code !== 1001) {
          // Abnormal closure
          setError(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`))
        }
      }
      
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to connect'))
      setIsConnected(false)
    }
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
    pause,
    resume,
    setFps,
  }
}
