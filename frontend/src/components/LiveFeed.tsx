'use client'

import { useState, useEffect } from 'react'
import { getEnvironmentPreviewUrl } from '@/services/api'
import { LiveFrameState } from '@/hooks'

interface LiveFeedProps {
  // Environment for preview
  selectedEnvId: string | null
  
  // Live frame from WebSocket
  liveFrame: LiveFrameState | null
  
  // Status
  isActive: boolean  // Training or evaluating
  isConnected: boolean
  
  // Current episode/reward (from metrics or frame)
  episode: number
  currentReward: number
  
  // Controls
  isRecording: boolean
  onToggleRecording: () => void
  onReset: () => void
}

export function LiveFeed({
  selectedEnvId,
  liveFrame,
  isActive,
  isConnected,
  episode,
  currentReward,
  isRecording,
  onToggleRecording,
  onReset,
}: LiveFeedProps) {
  const [previewError, setPreviewError] = useState(false)
  const previewUrl = selectedEnvId ? getEnvironmentPreviewUrl(selectedEnvId) : null
  
  // Reset preview error when environment changes
  useEffect(() => {
    setPreviewError(false)
  }, [selectedEnvId])

  // Determine what to display
  const showLiveFrame = isActive && liveFrame?.frameData
  const showPreview = !isActive && selectedEnvId && !previewError
  const showPlaceholder = !showLiveFrame && !showPreview
  
  // Debug: log frame state
  useEffect(() => {
    if (isActive) {
      console.log('[LiveFeed] Active state:', { 
        isActive, 
        hasFrameData: !!liveFrame?.frameData,
        isConnected,
        frameDataLength: liveFrame?.frameData?.length,
        episode: liveFrame?.episode,
      })
    }
  }, [isActive, liveFrame, isConnected])

  return (
    <>
      {/* Live Feed Header */}
      <div className="panel-header">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="label m-0">LIVE FEED</span>
            {isActive && (
              <span className={`inline-flex items-center gap-1 text-[9px] uppercase ${isConnected ? 'text-green-600' : 'text-yellow-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                {isConnected ? 'LIVE' : 'CONNECTING...'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className={`btn btn-secondary w-auto px-3 py-1 text-[10px] ${isRecording ? 'bg-red-100 border-red-500 text-red-600' : ''}`}
              onClick={onToggleRecording}
              disabled={!isActive}
            >
              {isRecording ? 'Stop Rec' : 'Record'}
            </button>
            <button
              className="btn btn-secondary w-auto px-3 py-1 text-[10px]"
              onClick={onReset}
              title="Clear display to 0 (metrics, reward history, insight)"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Stage / Visualization Area */}
      <div className="stage bg-[#0D0D0D] flex-1 flex justify-center items-center relative text-white overflow-hidden" style={{ aspectRatio: '16/9', minHeight: '200px' }}>
        {/* Live Frame Display */}
        {showLiveFrame && (
          <img
            src={`data:image/jpeg;base64,${liveFrame.frameData}`}
            alt="Live environment render"
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Environment Preview (Idle State) */}
        {showPreview && previewUrl && (
          <img
            src={previewUrl}
            alt={`${selectedEnvId} preview`}
            className="max-w-full max-h-full object-contain opacity-90"
            onError={() => setPreviewError(true)}
          />
        )}

        {/* Placeholder when no environment selected or preview failed */}
        {showPlaceholder && (
          <PlaceholderVisualization
            hasSelectedEnv={!!selectedEnvId}
            previewFailed={!!selectedEnvId && previewError}
          />
        )}

        {/* Episode/Reward Badges - Stacked vertically */}
        <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1.5">
          <span className="badge text-white text-[10px]">EPISODE: {episode}</span>
          <span className="badge text-white text-[10px]">
            REWARD: {currentReward >= 0 ? '+' : ''}
            {currentReward.toFixed(1)}
          </span>
        </div>

        {/* Connection status overlay */}
        {isActive && !isConnected && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Connecting to stream...
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Placeholder visualization when no environment is selected or preview failed
 */
function PlaceholderVisualization({
  hasSelectedEnv,
  previewFailed,
}: {
  hasSelectedEnv: boolean
  previewFailed: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center text-white/50 px-4 text-center">
      <svg
        className="w-16 h-16 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
      {!hasSelectedEnv && (
        <>
          <p className="text-xs uppercase tracking-wider">Select an environment to preview</p>
          <p className="text-[10px] mt-1">or start training to see live render</p>
        </>
      )}
      {hasSelectedEnv && previewFailed && (
        <>
          <p className="text-xs uppercase tracking-wider text-amber-400/90">Preview unavailable</p>
          <p className="text-[10px] mt-1">Start the backend to see previews: run <code className="bg-white/10 px-1 rounded">make backend</code> in a terminal</p>
        </>
      )}
    </div>
  )
}
