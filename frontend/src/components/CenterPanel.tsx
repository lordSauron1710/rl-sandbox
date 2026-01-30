'use client'

import { useState } from 'react'
import { LiveFeed } from './LiveFeed'
import { LiveFrameState } from '@/hooks'

export interface Metrics {
  meanReward: number
  episodeLength: number
  loss: number
  fps: number
}

export interface AlgorithmInfo {
  name: string
  intuition: string
  keyIdea: string
  bestFor: string
}

interface CenterPanelProps {
  // Environment selection (for preview)
  selectedEnvId: string | null
  
  // Live streaming
  liveFrame: LiveFrameState | null
  isActive: boolean  // Training or evaluating
  isStreamConnected: boolean
  
  // Metrics
  episode: number
  currentReward: number
  metrics: Metrics
  rewardHistory: number[]
  
  // Algorithm info
  algorithmInfo?: AlgorithmInfo
  
  // Recording controls
  isRecording: boolean
  onToggleRecording: () => void
  onReset: () => void
}

export function CenterPanel({
  selectedEnvId,
  liveFrame,
  isActive,
  isStreamConnected,
  episode,
  currentReward,
  metrics,
  rewardHistory,
  algorithmInfo,
  isRecording,
  onToggleRecording,
  onReset,
}: CenterPanelProps) {
  // Normalize reward history for bar display (0-100%)
  const maxReward = Math.max(...rewardHistory, 1)
  const minReward = Math.min(...rewardHistory, 0)
  const range = maxReward - minReward || 1

  return (
    <div className="panel-card col flex-1 min-w-0">
      {/* Live Feed Section */}
      <LiveFeed
        selectedEnvId={selectedEnvId}
        liveFrame={liveFrame}
        isActive={isActive}
        isConnected={isStreamConnected}
        episode={episode}
        currentReward={currentReward}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
        onReset={onReset}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-4 border-t border-border bg-white">
        <MetricCard label="Mean Reward" value={metrics.meanReward.toFixed(1)} />
        <MetricCard label="Eps Length" value={metrics.episodeLength.toString()} />
        <MetricCard label="Loss" value={metrics.loss.toFixed(3)} />
        <MetricCard label="FPS" value={metrics.fps.toString()} />
      </div>

      {/* Reward History Chart */}
      <RewardHistoryChart rewardHistory={rewardHistory} minReward={minReward} range={range} />

      {/* Algorithm Explainer */}
      {algorithmInfo && (
        <div className="p-4 bg-white flex-1 flex flex-col">
          <span className="label">ALGORITHM INTUITION</span>
          <div className="bg-surface-secondary rounded mt-2 flex-1 grid grid-cols-3 min-h-[80px]">
            <ExplainerCell title="Algorithm" content={algorithmInfo.name} />
            <ExplainerCell title="Key Idea" content={algorithmInfo.keyIdea} />
            <ExplainerCell title="Best For" content={algorithmInfo.bestFor} isLast />
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-components

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span className="label">{label}</span>
      <div className="metric-value">{value}</div>
    </div>
  )
}

function ExplainerCell({
  title,
  content,
  isLast = false,
}: {
  title: string
  content: string
  isLast?: boolean
}) {
  return (
    <div className={`p-4 ${isLast ? '' : 'border-r border-border'}`}>
      <div className="label mb-2">{title}</div>
      <div className="font-mono text-xs text-black leading-relaxed">{content}</div>
    </div>
  )
}

function RewardHistoryChart({
  rewardHistory,
  minReward,
  range,
}: {
  rewardHistory: number[]
  minReward: number
  range: number
}) {
  const [hoveredBar, setHoveredBar] = useState<{ index: number; x: number; y: number } | null>(null)

  // Show placeholder if no data
  if (rewardHistory.length === 0) {
    return (
      <div className="p-4 border-t border-border bg-white">
        <span className="label">REWARD HISTORY (LAST 100)</span>
        <div className="h-[60px] flex items-center justify-center mt-2">
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">
            No data yet - start training to see rewards
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 border-t border-border bg-white relative">
      <span className="label">REWARD HISTORY (LAST 100)</span>
      <div className="h-[60px] flex items-end gap-[2px] mt-2 relative">
        {rewardHistory.map((reward, index) => {
          const height = ((reward - minReward) / range) * 100
          return (
            <div
              key={index}
              className="bar relative cursor-pointer"
              style={{ height: `${Math.max(height, 2)}%` }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setHoveredBar({ 
                  index, 
                  x: rect.left + rect.width / 2,
                  y: rect.top
                })
              }}
              onMouseLeave={() => setHoveredBar(null)}
            />
          )
        })}
      </div>
      
      {/* Tooltip */}
      {hoveredBar !== null && (
        <div
          className="fixed z-50 bg-black text-white text-[10px] px-2 py-1 rounded pointer-events-none"
          style={{
            left: `${hoveredBar.x}px`,
            top: `${hoveredBar.y - 30}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-mono">EP {hoveredBar.index + 1}</div>
          <div className="font-mono font-semibold">{rewardHistory[hoveredBar.index].toFixed(1)}</div>
        </div>
      )}
    </div>
  )
}
