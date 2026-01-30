'use client'

import { useState, useEffect } from 'react'
import {
  Header,
  LeftSidebar,
  CenterPanel,
  RightSidebar,
  type Metrics,
  type AlgorithmInfo,
  type AnalysisInsight,
  type EventLogEntry,
} from '@/components'
import { useEnvironments, useTraining, useMetricsStream, useLiveFrames } from '@/hooks'

// Algorithm explanations
const algorithmExplanations: Record<string, AlgorithmInfo> = {
  PPO: {
    name: 'Proximal Policy Optimization',
    intuition:
      'PPO learns by trial and error, but with a safety net. It tries new actions, measures how much better or worse they are, then updates its strategy—but never too drastically.',
    keyIdea: 'Clip the policy updates to prevent destructive large changes',
    bestFor: 'Continuous and discrete action spaces, stable training',
  },
  DQN: {
    name: 'Deep Q-Network',
    intuition:
      "DQN learns the value of each action in each situation. It builds a mental map of 'if I'm here and do this, how good will things be?' Over time, it simply picks the action with the highest expected value.",
    keyIdea: 'Learn a Q-function that estimates future rewards for each action',
    bestFor: 'Discrete action spaces, game-like environments',
  },
}

const mockInsight: AnalysisInsight = {
  title: 'POLICY BEHAVIOR DETECTED',
  paragraphs: [
    'The agent has converged on a stable hovering strategy. Initial variance in the X-axis has reduced by 40% over the last 50 episodes.',
    'Reward shaping suggests the penalty for thruster usage is currently outweighing the benefit of rapid descent. Consider adjusting <code class="font-mono text-xs bg-surface-secondary px-1 py-0.5 rounded">main_engine_penalty</code>.',
  ],
}

/**
 * Parse timesteps string (with commas) to number
 */
function parseTimesteps(value: string): number {
  return parseInt(value.replace(/,/g, ''), 10) || 1000000
}

/**
 * Format number with commas
 */
function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

export default function Home() {
  // Fetch environments from API
  const { environments, isLoading: isLoadingEnvironments, error: environmentsError, refetch: refetchEnvironments } = useEnvironments()
  
  // Training state management
  const {
    currentRun,
    isCreating,
    isStarting,
    isStopping,
    isEvaluating,
    error: trainingError,
    createAndStartTraining,
    stop,
    evaluate,
    clearError,
  } = useTraining()

  // Metrics streaming
  const {
    metrics: streamedMetrics,
    rewardHistory: streamedRewardHistory,
    isConnected: isMetricsConnected,
    connect: connectMetrics,
    disconnect: disconnectMetrics,
  } = useMetricsStream()

  // Live frame streaming
  const {
    frame: liveFrame,
    isConnected: isFramesConnected,
    connect: connectFrames,
    disconnect: disconnectFrames,
  } = useLiveFrames()

  // Environment state - select first environment when loaded
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  
  // Auto-select first environment when loaded
  useEffect(() => {
    if (environments.length > 0 && !selectedEnvId) {
      setSelectedEnvId(environments[0].id)
    }
  }, [environments, selectedEnvId])

  // Hyperparameters state
  const [algorithm, setAlgorithm] = useState('PPO')
  const [learningRate, setLearningRate] = useState('0.0003')
  const [totalTimesteps, setTotalTimesteps] = useState('1,000,000')

  // Training UI state
  const [isRecording, setIsRecording] = useState(false)

  // Metrics state (local fallback + computed from stream)
  const [metrics, setMetrics] = useState<Metrics>({
    meanReward: 0,
    episodeLength: 0,
    loss: 0,
    fps: 0,
  })

  // Event log state
  const [events, setEvents] = useState<EventLogEntry[]>([])
  
  // Analysis insight state
  const [currentInsight, setCurrentInsight] = useState<AnalysisInsight | null>(null)

  // Derive training state from currentRun
  const isTraining = currentRun?.status === 'training' || isCreating || isStarting
  const isTesting = currentRun?.status === 'evaluating' || isEvaluating
  const isActive = isTraining || isTesting

  // Update metrics from stream
  useEffect(() => {
    if (streamedMetrics) {
      setMetrics({
        meanReward: streamedMetrics.reward,
        episodeLength: streamedMetrics.length,
        loss: streamedMetrics.loss ?? 0,
        fps: streamedMetrics.fps,
      })
      
      // Show insight after some training
      if (streamedMetrics.episode > 10 && !currentInsight) {
        setCurrentInsight(mockInsight)
      }
    }
  }, [streamedMetrics, currentInsight])

  // Connect streams as soon as we have a run and are training, evaluating, or about to start.
  // Connecting when isStarting ensures the backend has a subscriber before the first frame.
  useEffect(() => {
    const shouldConnect =
      currentRun?.id &&
      (currentRun.status === 'training' ||
        currentRun.status === 'evaluating' ||
        isStarting)

    if (shouldConnect) {
      connectMetrics(currentRun!.id)
      connectFrames(currentRun!.id, 15)
    } else {
      disconnectMetrics()
      disconnectFrames()
    }

    return () => {
      disconnectMetrics()
      disconnectFrames()
    }
  }, [currentRun?.id, currentRun?.status, isStarting, connectMetrics, disconnectMetrics, connectFrames, disconnectFrames])

  // Computed values from stream or local state
  const episode = streamedMetrics?.episode ?? 0
  const currentReward = liveFrame?.totalReward ?? streamedMetrics?.reward ?? 0
  const rewardHistory = streamedRewardHistory.length > 0 ? streamedRewardHistory : []

  // Add event to log
  const addEvent = (message: string, type: 'info' | 'warning' | 'success' | 'error' = 'info') => {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    setEvents(prev => [
      { id: Date.now().toString(), time, message, type },
      ...prev.slice(0, 49), // Keep last 50 events
    ])
  }

  // Handlers
  const handleTrain = async () => {
    if (!selectedEnvId) return
    
    clearError()
    addEvent(`Starting training [${algorithm}]...`, 'info')
    
    try {
      await createAndStartTraining({
        env_id: selectedEnvId,
        algorithm,
        hyperparameters: {
          learning_rate: parseFloat(learningRate),
          total_timesteps: parseTimesteps(totalTimesteps),
        },
      })
      
      addEvent(`Training started on ${selectedEnvId}`, 'success')
      addEvent('Environment initialized', 'success')
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start training'
      addEvent(`Error: ${message}`, 'error')
    }
  }

  const handleTest = async () => {
    if (!currentRun) {
      addEvent('No trained model available for testing', 'warning')
      return
    }
    
    clearError()
    addEvent('Starting evaluation: 10 episodes...', 'info')
    
    try {
      await evaluate(10)
      addEvent('Evaluation started', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start evaluation'
      addEvent(`Error: ${message}`, 'error')
    }
  }

  const handleStop = async () => {
    if (!currentRun) return
    
    clearError()
    addEvent('Stopping training...', 'info')
    
    try {
      await stop()
      addEvent('Training stopped', 'success')
      disconnectMetrics()
      disconnectFrames()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop training'
      addEvent(`Error: ${message}`, 'error')
    }
  }

  const handleReset = () => {
    setMetrics({
      meanReward: 0,
      episodeLength: 0,
      loss: 0,
      fps: 0,
    })
    setIsRecording(false)
    setCurrentInsight(null) // Clear analysis insight
    disconnectMetrics()
    disconnectFrames()
    addEvent('Session reset', 'info')
  }

  const handleGenerateReport = () => {
    addEvent('Generating report...', 'info')
    // TODO: Generate and download report
    console.log('Generating report...')
  }

  // Show error notification
  useEffect(() => {
    if (trainingError) {
      addEvent(`Error: ${trainingError.message}`, 'error')
    }
  }, [trainingError])

  return (
    <>
      <Header version="v0.0" />

      {/* Backend unreachable banner */}
      {environmentsError && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Backend not reachable.</span> Start it with <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-xs">make backend</code> so previews and training work.
          </p>
          <button
            type="button"
            onClick={() => refetchEnvironments()}
            className="btn btn-secondary text-xs py-1 px-2"
          >
            Retry
          </button>
        </div>
      )}

      <main
        className="main-grid flex-1 grid gap-6 h-[calc(100vh-60px)] overflow-hidden p-6 pt-4 bg-surface-secondary"
        style={{ gridTemplateColumns: '280px 1fr 320px' }}
      >
        {/* Left Sidebar */}
        <LeftSidebar
          environments={environments}
          isLoadingEnvironments={isLoadingEnvironments}
          selectedEnvId={selectedEnvId}
          onSelectEnvironment={setSelectedEnvId}
          algorithm={algorithm}
          onAlgorithmChange={setAlgorithm}
          learningRate={learningRate}
          onLearningRateChange={setLearningRate}
          totalTimesteps={totalTimesteps}
          onTotalTimestepsChange={setTotalTimesteps}
          onTrain={handleTrain}
          onTest={handleTest}
          onStop={handleStop}
          isTraining={isTraining}
          isTesting={isTesting}
          isCreatingRun={isCreating}
        />

        {/* Center Panel */}
        <CenterPanel
          selectedEnvId={selectedEnvId}
          liveFrame={liveFrame}
          isActive={isActive}
          isStreamConnected={isMetricsConnected || isFramesConnected}
          episode={episode}
          currentReward={currentReward}
          metrics={metrics}
          rewardHistory={rewardHistory}
          algorithmInfo={algorithmExplanations[algorithm]}
          isRecording={isRecording}
          onToggleRecording={() => setIsRecording(!isRecording)}
          onReset={handleReset}
        />

        {/* Right Sidebar */}
        <RightSidebar
          insight={currentInsight || undefined}
          events={events}
          onGenerateReport={handleGenerateReport}
        />
      </main>
    </>
  )
}
