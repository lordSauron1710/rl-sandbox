'use client'

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
  episode: number
  currentReward: number
  metrics: Metrics
  rewardHistory: number[]
  algorithmInfo?: AlgorithmInfo
  isRecording: boolean
  onToggleRecording: () => void
  onReset: () => void
  // For live feed - can be extended to accept video stream/canvas
  liveFeedContent?: React.ReactNode
}

export function CenterPanel({
  episode,
  currentReward,
  metrics,
  rewardHistory,
  algorithmInfo,
  isRecording,
  onToggleRecording,
  onReset,
  liveFeedContent,
}: CenterPanelProps) {
  // Normalize reward history for bar display (0-100%)
  const maxReward = Math.max(...rewardHistory, 1)
  const minReward = Math.min(...rewardHistory, 0)
  const range = maxReward - minReward || 1

  return (
    <div className="panel-card col flex-1 min-w-0">
      {/* Live Feed Header */}
      <div className="panel-header">
        <div className="flex justify-between items-center">
          <span className="label m-0">LIVE FEED</span>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary w-auto px-3 py-1 text-[10px]"
              onClick={onToggleRecording}
            >
              {isRecording ? 'Stop' : 'Record'}
            </button>
            <button
              className="btn btn-secondary w-auto px-3 py-1 text-[10px]"
              onClick={onReset}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Stage / Visualization Area */}
      <div className="stage bg-[#0D0D0D] flex-1 flex flex-col justify-center items-center relative text-white min-h-[300px]">
        {/* Default placeholder visualization */}
        {liveFeedContent || <LunarLanderPlaceholder />}

        {/* Episode/Reward Badges */}
        <div className="absolute top-4 left-4 pointer-events-none flex gap-2">
          <span className="badge text-white">EPISODE: {episode}</span>
          <span className="badge text-white">
            REWARD: {currentReward >= 0 ? '+' : ''}
            {currentReward.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 border-t border-border bg-white">
        <MetricCard label="Mean Reward" value={metrics.meanReward.toFixed(1)} />
        <MetricCard label="Eps Length" value={metrics.episodeLength.toString()} />
        <MetricCard label="Loss" value={metrics.loss.toFixed(3)} />
        <MetricCard label="FPS" value={metrics.fps.toString()} />
      </div>

      {/* Reward History Chart */}
      <div className="p-4 border-t border-border bg-white">
        <span className="label">REWARD HISTORY (LAST 100)</span>
        <div className="h-[60px] flex items-end gap-[2px] mt-2">
          {rewardHistory.map((reward, index) => {
            const height = ((reward - minReward) / range) * 100
            return (
              <div
                key={index}
                className="bar"
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            )
          })}
        </div>
      </div>

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

function LunarLanderPlaceholder() {
  return (
    <div className="relative w-[200px] h-[150px]">
      {/* Ground */}
      <div className="absolute bottom-5 left-0 right-0 h-[2px] bg-white rounded" />
      {/* Lander body */}
      <div
        className="absolute bottom-20 left-[90px] w-5 h-5 border border-white"
        style={{ transform: 'rotate(15deg)' }}
      />
      {/* Lander leg */}
      <div
        className="absolute bottom-[65px] left-[98px] w-1 h-3 bg-white"
        style={{ transform: 'rotate(15deg)' }}
      />
      {/* Thrust particles */}
      <div className="absolute bottom-[50px] left-[96px] w-[2px] h-[2px] bg-white/60" />
      <div className="absolute bottom-[45px] left-[100px] w-[2px] h-[2px] bg-white/40" />
    </div>
  )
}
