'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { ApiRun } from '@/services/api'

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

const DEFAULT_LEARNING_RATE = '0.0003'
const DEFAULT_TOTAL_TIMESTEPS = '1,000,000'
const DEFAULT_EVAL_EPISODES = 10

/**
 * Parse timesteps string (with commas) to number
 */
function parseTimesteps(value: string): number {
  return parseInt(value.replace(/,/g, ''), 10) || 1000000
}

function clampPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value as number))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function buildAnalysisInsight({
  run,
  envLabel,
  actionSpaceType,
  algorithm,
  rewardHistory,
  meanReward,
  episodeLength,
  fps,
  trainingProgressPercent,
  testingProgressPercent,
  currentEvalEpisode,
  totalEvalEpisodes,
}: {
  run: ApiRun | null
  envLabel: string
  actionSpaceType: 'Discrete' | 'Continuous' | 'Unknown'
  algorithm: string
  rewardHistory: number[]
  meanReward: number
  episodeLength: number
  fps: number
  trainingProgressPercent: number
  testingProgressPercent: number
  currentEvalEpisode: number
  totalEvalEpisodes: number
}): AnalysisInsight | null {
  if (!run) return null

  const mode = run.status === 'evaluating' ? 'EVALUATION' : 'TRAINING'
  const progressPercent = run.status === 'evaluating' ? testingProgressPercent : trainingProgressPercent
  const progressText = `${Math.round(progressPercent)}%`

  if (rewardHistory.length < 3) {
    return {
      title: `${mode} INITIALIZING`,
      paragraphs: [
        `${algorithm} on ${envLabel} is active (${actionSpaceType} action space). Progress is ${progressText} while early episodes are still collecting signal.`,
        `Current telemetry: mean reward ${meanReward.toFixed(1)}, episode length ${episodeLength}, stream FPS ${fps}.`,
      ],
    }
  }

  const windowSize = Math.min(10, rewardHistory.length)
  const recentWindow = rewardHistory.slice(-windowSize)
  const previousWindow = rewardHistory.slice(-windowSize * 2, -windowSize)

  const recentMean = mean(recentWindow)
  const previousMean = previousWindow.length > 0 ? mean(previousWindow) : recentMean
  const delta = recentMean - previousMean
  const volatility = stdDev(recentWindow)

  const trendLabel =
    delta > 1 ? 'improving' : delta < -1 ? 'regressing' : 'flat'
  const trendMagnitude = Math.abs(delta).toFixed(1)

  const genericTip =
    algorithm === 'DQN'
      ? 'If trend stays flat, increase timesteps or lower learning rate so replay updates stabilize.'
      : actionSpaceType === 'Continuous'
      ? 'Continuous-control runs are noisy early; prioritize trend over single-episode spikes.'
      : 'If volatility remains high, extend timesteps or reduce learning rate for smoother policy updates.'

  const modeParagraph =
    run.status === 'evaluating'
      ? `Evaluation progress is ${progressText} (${Math.max(0, currentEvalEpisode)}/${Math.max(1, totalEvalEpisodes)} episodes).`
      : `Training progress is ${progressText} (${run.progress?.current_timestep ?? 0}/${run.progress?.total_timesteps ?? 0} timesteps).`

  return {
    title: `${mode} SIGNAL`,
    paragraphs: [
      `${algorithm} on ${envLabel}: recent reward mean ${recentMean.toFixed(1)} (${trendLabel}, ${trendMagnitude} vs previous ${windowSize}-episode window).`,
      `Reward volatility over the latest window is ${volatility.toFixed(1)}; current episode length is ${episodeLength} and live stream FPS is ${fps}.`,
      `${modeParagraph} ${genericTip}`,
    ],
  }
}

export default function Home() {
  // Fetch environments from API
  const { environments, isLoading: isLoadingEnvironments, error: environmentsError, refetch: refetchEnvironments } = useEnvironments()
  
  // Training state management
  const {
    currentRun,
    evaluationProgress,
    isCreating,
    isStarting,
    isStoppingTraining,
    isStoppingEvaluation,
    isEvaluating,
    createAndStartTraining,
    stop,
    evaluate,
    clearCurrentRun,
    clearError,
  } = useTraining()

  // Metrics streaming
  const {
    metrics: streamedMetrics,
    rewardHistory: streamedRewardHistory,
    connect: connectMetrics,
    disconnect: disconnectMetrics,
    clear: clearMetricsStream,
  } = useMetricsStream()

  // Live frame streaming
  const {
    frame: liveFrame,
    isConnected: isFramesConnected,
    connect: connectFrames,
    disconnect: disconnectFrames,
    clear: clearFramesStream,
    clearError: clearFramesError,
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
  const [learningRate, setLearningRate] = useState(DEFAULT_LEARNING_RATE)
  const [totalTimesteps, setTotalTimesteps] = useState(DEFAULT_TOTAL_TIMESTEPS)

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

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvId) ?? null,
    [environments, selectedEnvId]
  )

  // Derive operation states from current run + network transitions
  const isTraining =
    currentRun?.status === 'training' || isCreating || isStarting || isStoppingTraining
  const isTesting =
    currentRun?.status === 'evaluating' || isEvaluating || isStoppingEvaluation
  const isActive =
    currentRun?.status === 'training' ||
    currentRun?.status === 'evaluating' ||
    isStarting ||
    isEvaluating
  const hasTrainedRun =
    currentRun !== null &&
    currentRun.status !== 'pending' &&
    currentRun.status !== 'failed'

  const trainingProgressPercent = clampPercent(currentRun?.progress?.percent_complete)
  const testingProgressPercent = clampPercent(
    evaluationProgress?.percent_complete ?? (currentRun?.status === 'evaluating' ? 0 : undefined)
  )

  // Update metrics from stream
  useEffect(() => {
    if (streamedMetrics) {
      setMetrics({
        meanReward: streamedMetrics.reward,
        episodeLength: streamedMetrics.length,
        loss: streamedMetrics.loss ?? 0,
        fps: streamedMetrics.fps,
      })
    }
  }, [streamedMetrics])

  // Connect streams as soon as we have a run (including pending) so the backend has a
  // subscriber before training starts. This ensures the live feed shows frames from the
  // first step for all environments and training states.
  useEffect(() => {
    if (!currentRun?.id) {
      disconnectMetrics()
      disconnectFrames()
      return
    }

    const shouldConnect =
      currentRun.status === 'pending' ||
      currentRun.status === 'training' ||
      currentRun.status === 'evaluating' ||
      isStarting

    if (shouldConnect) {
      connectMetrics(currentRun.id)
      void connectFrames(currentRun.id, 15).catch(() => {
        // Stream connection is best-effort. Training/eval should still run.
        clearFramesError()
      })
      return
    }

    disconnectMetrics()
    disconnectFrames()
  }, [
    currentRun?.id,
    currentRun?.status,
    isStarting,
    connectMetrics,
    disconnectMetrics,
    connectFrames,
    disconnectFrames,
    clearFramesError,
  ])

  useEffect(() => {
    return () => {
      disconnectMetrics()
      disconnectFrames()
    }
  }, [disconnectMetrics, disconnectFrames])

  // Computed values from stream or local state
  const episode = streamedMetrics?.episode ?? 0
  const currentReward = liveFrame?.totalReward ?? streamedMetrics?.reward ?? 0
  const rewardHistory = streamedRewardHistory.length > 0 ? streamedRewardHistory : []
  const currentInsight = useMemo<AnalysisInsight | null>(
    () =>
      buildAnalysisInsight({
        run: currentRun,
        envLabel: selectedEnvironment?.name ?? selectedEnvId ?? 'selected environment',
        actionSpaceType: selectedEnvironment?.action_space_type ?? 'Unknown',
        algorithm,
        rewardHistory,
        meanReward: metrics.meanReward,
        episodeLength: metrics.episodeLength,
        fps: metrics.fps,
        trainingProgressPercent,
        testingProgressPercent,
        currentEvalEpisode: evaluationProgress?.current_episode ?? 0,
        totalEvalEpisodes: evaluationProgress?.total_episodes ?? DEFAULT_EVAL_EPISODES,
      }),
    [
      currentRun,
      selectedEnvironment,
      selectedEnvId,
      algorithm,
      rewardHistory,
      metrics.meanReward,
      metrics.episodeLength,
      metrics.fps,
      trainingProgressPercent,
      testingProgressPercent,
      evaluationProgress,
    ]
  )

  // Add event to log (stored with timestamp for chronological sort)
  const addEvent = useCallback((message: string, type: 'info' | 'warning' | 'success' | 'error' = 'info') => {
    const now = new Date()
    const timestamp = now.getTime()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    setEvents(prev => [
      { id: `${timestamp}-${Math.random().toString(36).slice(2, 9)}`, time, timestamp, message, type },
      ...prev.slice(0, 49), // Keep last 50 events
    ])
  }, [])

  const previousRunStatusRef = useRef<string | null>(null)
  useEffect(() => {
    const nextStatus = currentRun?.status ?? null
    const previousStatus = previousRunStatusRef.current
    if (!nextStatus || nextStatus === previousStatus) {
      previousRunStatusRef.current = nextStatus
      return
    }

    if (nextStatus === 'completed') addEvent('Training completed', 'success')
    if (nextStatus === 'failed') addEvent('Run failed', 'error')
    if (nextStatus === 'stopped' && previousStatus === 'training') addEvent('Training stopped', 'success')
    if (nextStatus === 'evaluating' && previousStatus !== 'evaluating') addEvent('Evaluation started', 'success')
    if (previousStatus === 'evaluating' && nextStatus !== 'evaluating') addEvent('Evaluation finished', 'success')
    previousRunStatusRef.current = nextStatus
  }, [currentRun?.status, addEvent])

  // Handlers
  const handleTrain = async () => {
    if (!selectedEnvId) return
    if (isTraining || isTesting) return
    
    clearError()
    clearFramesError()
    addEvent(`Starting training [${algorithm}]...`, 'info')
    
    try {
      const parsedLearningRate = Number.parseFloat(learningRate)
      const safeLearningRate =
        Number.isFinite(parsedLearningRate) && parsedLearningRate > 0
          ? parsedLearningRate
          : 0.0003

      // Connect to frames/metrics as soon as we have a run (before startTraining) so the
      // backend has a subscriber from the first step and the live feed shows the environment.
      await createAndStartTraining(
        {
          env_id: selectedEnvId,
          algorithm,
          hyperparameters: {
            learning_rate: safeLearningRate,
            total_timesteps: parseTimesteps(totalTimesteps),
          },
        },
        {
          onRunCreated: async (run) => {
            connectMetrics(run.id)
            try {
              await Promise.race([
                connectFrames(run.id, 15),
                new Promise<void>((_, reject) =>
                  setTimeout(() => reject(new Error('Connection timeout')), 8000)
                ),
              ])
            } catch {
              // Live feed WebSocket failed or timed out. Don't block training; clear so no error toast.
              clearFramesError()
            }
          },
        }
      )
      
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
    addEvent(`Starting evaluation: ${DEFAULT_EVAL_EPISODES} episodes...`, 'info')
    
    try {
      // Connect frames before evaluation so the live feed shows the environment during test
      connectMetrics(currentRun.id)
      try {
        await Promise.race([
          connectFrames(currentRun.id, 15),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 8000)
          ),
        ])
      } catch {
        clearFramesError()
      }
      await evaluate(DEFAULT_EVAL_EPISODES)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start evaluation'
      addEvent(`Error: ${message}`, 'error')
    }
  }

  const handleStop = async () => {
    if (!currentRun) return
    
    const mode = currentRun.status === 'evaluating' ? 'evaluation' : 'training'
    clearError()
    addEvent(`Stopping ${mode}...`, 'info')
    
    try {
      await stop()
      addEvent(`${mode[0].toUpperCase()}${mode.slice(1)} stop requested`, 'info')
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to stop ${mode}`
      addEvent(`Error: ${message}`, 'error')
    }
  }

  const handleReset = async () => {
    clearError()
    clearFramesError()

    if (currentRun && (currentRun.status === 'training' || currentRun.status === 'evaluating')) {
      addEvent('Global reset requested: stopping active run...', 'info')
      try {
        await Promise.race([
          stop(),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ])
      } catch {
        // Continue reset even if stop API fails.
      }
    }

    disconnectMetrics()
    disconnectFrames()
    clearMetricsStream()
    clearFramesStream()
    setMetrics({
      meanReward: 0,
      episodeLength: 0,
      loss: 0,
      fps: 0,
    })
    setIsRecording(false)
    setLearningRate(DEFAULT_LEARNING_RATE)
    setTotalTimesteps(DEFAULT_TOTAL_TIMESTEPS)
    setAlgorithm('PPO')
    clearCurrentRun()
    setEvents([])
    addEvent('Global reset complete', 'info')
  }

  const handleGenerateReport = () => {
    addEvent('Generating report...', 'info')
    // TODO: Generate and download report
    console.log('Generating report...')
  }

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
          isCreatingRun={isCreating || isStarting}
          isStoppingTraining={isStoppingTraining}
          isStoppingTesting={isStoppingEvaluation}
          trainingProgressPercent={trainingProgressPercent}
          testingProgressPercent={testingProgressPercent}
          hasTrainedRun={hasTrainedRun}
        />

        {/* Center Panel */}
        <CenterPanel
          selectedEnvId={selectedEnvId}
          liveFrame={liveFrame}
          isActive={isActive}
          isStreamConnected={isFramesConnected}
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
