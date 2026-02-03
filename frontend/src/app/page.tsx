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
} from '@/components'
import {
  useEnvironments,
  useTraining,
  useMetricsStream,
  useLiveFrames,
  useEventLog,
} from '@/hooks'
import {
  ApiRun,
  EvaluationSummary,
  getLatestEvaluation,
  getLatestEvaluationVideoUrl,
  toAbsoluteApiUrl,
} from '@/services/api'

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
  const progressPercent =
    run.status === 'evaluating' ? testingProgressPercent : trainingProgressPercent
  const progressText = `${Math.round(progressPercent)}%`

  if (rewardHistory.length < 5) {
    return {
      title: `${mode} EXPLORATION PHASE`,
      paragraphs: [
        `${algorithm} on ${envLabel} is collecting early episodes (${actionSpaceType} action space). Progress is ${progressText} while policy behavior is still exploratory.`,
        `Telemetry snapshot: mean reward ${meanReward.toFixed(1)}, episode length ${episodeLength}, stream FPS ${fps}.`,
        'Recommendation: keep running until at least 10 episodes before making hyperparameter changes.',
      ],
    }
  }

  const windowSize = Math.min(12, rewardHistory.length)
  const recentWindow = rewardHistory.slice(-windowSize)
  const previousWindow = rewardHistory.slice(-windowSize * 2, -windowSize)

  const recentMean = mean(recentWindow)
  const previousMean = previousWindow.length > 0 ? mean(previousWindow) : recentMean
  const delta = recentMean - previousMean
  const volatility = stdDev(recentWindow)
  const convergenceThreshold = Math.max(0.75, Math.abs(recentMean) * 0.05)
  const stableVolatilityThreshold = Math.max(2, Math.abs(recentMean) * 0.1)
  const highVarianceThreshold = Math.max(6, Math.abs(recentMean) * 0.28)

  const isConverging =
    run.status !== 'evaluating' &&
    progressPercent >= 40 &&
    Math.abs(delta) <= convergenceThreshold &&
    volatility <= stableVolatilityThreshold

  const isHighVariance = volatility >= highVarianceThreshold
  const isPlateaued = run.status !== 'evaluating' && progressPercent >= 30 && delta <= 0

  if (run.status === 'evaluating') {
    return {
      title: 'GENERALIZATION CHECK',
      paragraphs: [
        `Evaluation is ${progressText} complete (${Math.max(0, currentEvalEpisode)}/${Math.max(1, totalEvalEpisodes)} episodes). Recent return mean is ${recentMean.toFixed(1)}.`,
        `Observed variance is ${volatility.toFixed(1)} across the latest ${windowSize} episodes, indicating ${isHighVariance ? 'unstable' : 'consistent'} policy behavior.`,
        isHighVariance
          ? 'Recommendation: increase training timesteps and reduce learning rate before the next evaluation pass.'
          : 'Recommendation: policy appears portable; run a longer evaluation set to confirm stability.',
      ],
    }
  }

  if (isConverging) {
    return {
      title: 'CONVERGENCE DETECTED',
      paragraphs: [
        `Recent reward mean (${recentMean.toFixed(1)}) is flat against the prior window (delta ${delta.toFixed(1)}), and volatility has reduced to ${volatility.toFixed(1)}.`,
        `Episode length is ${episodeLength} with stream FPS at ${fps}. This is a stable behavior signature for ${algorithm}.`,
        'Recommendation: keep current hyperparameters and extend total timesteps to solidify policy consistency.',
      ],
    }
  }

  if (isHighVariance) {
    return {
      title: 'HIGH VARIANCE POLICY',
      paragraphs: [
        `Reward swing is elevated (${volatility.toFixed(1)} std over ${windowSize} episodes) with mean ${recentMean.toFixed(1)} and trend delta ${delta.toFixed(1)}.`,
        `Behavior suggests unstable exploration/exploitation balance for ${algorithm} on ${envLabel}.`,
        actionSpaceType === 'Continuous'
          ? 'Recommendation: lower learning rate and increase rollout horizon; continuous control benefits from smoother policy updates.'
          : 'Recommendation: lower learning rate or increase replay/batch coverage to reduce oscillation.',
      ],
    }
  }

  if (isPlateaued) {
    return {
      title: 'PLATEAU PATTERN',
      paragraphs: [
        `Recent mean (${recentMean.toFixed(1)}) is not improving versus prior episodes (delta ${delta.toFixed(1)}).`,
        `Training progress is ${progressText} (${run.progress?.current_timestep ?? 0}/${run.progress?.total_timesteps ?? 0} timesteps).`,
        algorithm === 'DQN'
          ? 'Recommendation: extend timesteps and reduce learning rate; if still stuck, tune exploration_fraction for better coverage.'
          : 'Recommendation: consider reward shaping or adjusting batch/n_steps to escape the local optimum.',
      ],
    }
  }

  return {
    title: 'LEARNING TREND DETECTED',
    paragraphs: [
      `Recent reward mean is ${recentMean.toFixed(1)} with delta ${delta.toFixed(1)} over the prior ${windowSize}-episode window.`,
      `Volatility is ${volatility.toFixed(1)} and episode length is ${episodeLength}; live FPS is ${fps}.`,
      'Recommendation: continue current run and reassess after another 10-20 episodes for clearer policy direction.',
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

  // Event log streaming (backend SSE + local UI events)
  const {
    events,
    isConnected: isEventsConnected,
    error: eventsError,
    connect: connectEvents,
    disconnect: disconnectEvents,
    clear: clearEvents,
    addLocalEvent,
  } = useEventLog()

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

  // Metrics state (local fallback + computed from stream)
  const [metrics, setMetrics] = useState<Metrics>({
    meanReward: 0,
    episodeLength: 0,
    loss: 0,
    fps: 0,
  })
  const [latestEvaluationSummary, setLatestEvaluationSummary] =
    useState<EvaluationSummary | null>(null)
  const [evaluationPlaybackUrl, setEvaluationPlaybackUrl] = useState<string | null>(
    null
  )
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvId) ?? null,
    [environments, selectedEnvId]
  )
  const currentRunIdRef = useRef<string | null>(null)
  const previousRunStatusRef = useRef<string | null>(null)
  const evaluationRequestedAtRef = useRef<number | null>(null)
  const evaluationFetchInFlightRef = useRef(false)

  const resolvePlaybackUrl = useCallback(
    (runId: string, summary: EvaluationSummary) => {
      const candidatePath =
        summary.video_path ??
        (summary.num_episodes > 0 ? getLatestEvaluationVideoUrl(runId) : null)

      if (!candidatePath) {
        return null
      }

      const absolute = toAbsoluteApiUrl(candidatePath)
      const summaryTimestamp = Date.parse(summary.timestamp)
      const cacheKey = Number.isFinite(summaryTimestamp)
        ? summaryTimestamp.toString()
        : Date.now().toString()
      const separator = absolute.includes('?') ? '&' : '?'
      return `${absolute}${separator}t=${cacheKey}`
    },
    []
  )

  const refreshEvaluationPlayback = useCallback(
    async (runId: string, options?: { logCompletion?: boolean }) => {
      if (evaluationFetchInFlightRef.current) {
        return
      }

      evaluationFetchInFlightRef.current = true
      try {
        const summary = await getLatestEvaluation(runId)
        if (currentRunIdRef.current !== runId) {
          return
        }
        const requestedAt = evaluationRequestedAtRef.current
        const summaryTimestamp = Date.parse(summary.timestamp)

        if (
          requestedAt &&
          Number.isFinite(summaryTimestamp) &&
          summaryTimestamp + 1500 < requestedAt
        ) {
          // Stale summary from an older evaluation; keep waiting for fresh artifacts.
          if (options?.logCompletion) {
            addLocalEvent(
              'Evaluation finished but latest summary is stale; playback unavailable.',
              'warning',
              'warning'
            )
          }
          return
        }

        setLatestEvaluationSummary(summary)
        setMetrics({
          meanReward: summary.mean_reward,
          episodeLength: Math.round(summary.mean_length),
          loss: 0,
          fps: 0,
        })

        const playbackUrl = resolvePlaybackUrl(runId, summary)
        setEvaluationPlaybackUrl(playbackUrl)
        setPlaybackError(null)
        evaluationRequestedAtRef.current = null

        if (options?.logCompletion) {
          addLocalEvent(
            `Evaluation complete: ${summary.num_episodes} episodes (mean reward ${summary.mean_reward.toFixed(1)})`,
            'success',
            'evaluation_completed'
          )
          if (!playbackUrl) {
            addLocalEvent(
              'Evaluation summary available but no MP4 artifact was found.',
              'warning',
              'warning'
            )
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load evaluation summary'
        setPlaybackError(message)
        setEvaluationPlaybackUrl(null)
        if (options?.logCompletion) {
          addLocalEvent(
            `Evaluation finished but summary fetch failed: ${message}`,
            'warning',
            'warning'
          )
        }
      } finally {
        evaluationFetchInFlightRef.current = false
      }
    },
    [addLocalEvent, resolvePlaybackUrl]
  )

  useEffect(() => {
    currentRunIdRef.current = currentRun?.id ?? null
  }, [currentRun?.id])

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
    if (evaluationPlaybackUrl && !isActive) {
      return
    }
    if (streamedMetrics) {
      setMetrics({
        meanReward: streamedMetrics.reward,
        episodeLength: streamedMetrics.length,
        loss: streamedMetrics.loss ?? 0,
        fps: streamedMetrics.fps,
      })
    }
  }, [streamedMetrics, evaluationPlaybackUrl, isActive])

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

  // Keep event stream connected for the active run lifecycle.
  useEffect(() => {
    if (!currentRun?.id) {
      disconnectEvents()
      return
    }
    connectEvents(currentRun.id)
  }, [currentRun?.id, connectEvents, disconnectEvents])

  useEffect(() => {
    return () => {
      disconnectMetrics()
      disconnectFrames()
      disconnectEvents()
    }
  }, [disconnectMetrics, disconnectFrames, disconnectEvents])

  useEffect(() => {
    const previousStatus = previousRunStatusRef.current
    const nextStatus = currentRun?.status ?? null

    if (
      currentRun?.id &&
      previousStatus === 'evaluating' &&
      nextStatus !== null &&
      nextStatus !== 'evaluating'
    ) {
      void refreshEvaluationPlayback(currentRun.id, { logCompletion: true })
    }

    previousRunStatusRef.current = nextStatus
  }, [currentRun?.id, currentRun?.status, refreshEvaluationPlayback])

  // Computed values from stream or local state
  const isPlaybackMode = !isActive && !!evaluationPlaybackUrl
  const episode = isPlaybackMode
    ? latestEvaluationSummary?.num_episodes ?? 0
    : liveFrame?.episode ??
      (currentRun?.status === 'evaluating'
        ? evaluationProgress?.current_episode
        : undefined) ??
      streamedMetrics?.episode ??
      0
  const currentReward = isPlaybackMode
    ? latestEvaluationSummary?.mean_reward ?? 0
    : liveFrame?.totalReward ?? streamedMetrics?.reward ?? 0
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

  const handlePlaybackError = useCallback(() => {
    if (!playbackError) {
      addLocalEvent('Evaluation playback unavailable.', 'warning', 'warning')
    }
    setPlaybackError('Failed to load evaluation playback.')
  }, [addLocalEvent, playbackError])

  // Handlers
  const handleTrain = async () => {
    if (!selectedEnvId) return
    if (isTraining || isTesting) return
    
    clearError()
    clearFramesError()
    setLatestEvaluationSummary(null)
    setEvaluationPlaybackUrl(null)
    setPlaybackError(null)
    evaluationRequestedAtRef.current = null
    addLocalEvent(`Starting training [${algorithm}]...`, 'info', 'training_requested')
    
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
            connectEvents(run.id)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start training'
      addLocalEvent(`Error: ${message}`, 'error', 'error')
    }
  }

  const handleTest = async () => {
    if (!currentRun) {
      addLocalEvent('No trained model available for testing', 'warning', 'warning')
      return
    }
    
    clearError()
    setEvaluationPlaybackUrl(null)
    setPlaybackError(null)
    evaluationRequestedAtRef.current = Date.now()
    addLocalEvent(
      `Starting evaluation: ${DEFAULT_EVAL_EPISODES} episodes...`,
      'info',
      'evaluation_requested'
    )
    
    try {
      // Connect frames before evaluation so the live feed shows the environment during test
      connectEvents(currentRun.id)
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
      addLocalEvent(
        `Evaluation started: ${DEFAULT_EVAL_EPISODES} episodes`,
        'success',
        'evaluation_started'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start evaluation'
      addLocalEvent(`Error: ${message}`, 'error', 'error')
    }
  }

  const handleStop = async () => {
    if (!currentRun) return
    
    const mode = currentRun.status === 'evaluating' ? 'evaluation' : 'training'
    clearError()
    addLocalEvent(`Stopping ${mode}...`, 'info', `${mode}_stop_requested`)
    
    try {
      await stop()
      addLocalEvent(
        `${mode[0].toUpperCase()}${mode.slice(1)} stop requested`,
        'info',
        `${mode}_stop_requested`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to stop ${mode}`
      addLocalEvent(`Error: ${message}`, 'error', 'error')
    }
  }

  const handleReset = async () => {
    clearError()
    clearFramesError()

    if (currentRun && (currentRun.status === 'training' || currentRun.status === 'evaluating')) {
      addLocalEvent('Global reset requested: stopping active run...', 'info', 'reset_requested')
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
    setLearningRate(DEFAULT_LEARNING_RATE)
    setTotalTimesteps(DEFAULT_TOTAL_TIMESTEPS)
    setAlgorithm('PPO')
    setLatestEvaluationSummary(null)
    setEvaluationPlaybackUrl(null)
    setPlaybackError(null)
    evaluationRequestedAtRef.current = null
    clearCurrentRun()
    clearEvents()
    addLocalEvent('Global reset complete', 'info', 'reset_complete')
  }

  const handleGenerateReport = () => {
    addLocalEvent('Generating report...', 'info', 'report_requested')

    try {
      const generatedAt = new Date()
      const timestampTag = generatedAt.toISOString().replace(/[:.]/g, '-')
      const runSegment = currentRun?.id.slice(0, 8) ?? 'session'
      const fileName = `rl-report-${runSegment}-${timestampTag}.json`

      const report = {
        generated_at: generatedAt.toISOString(),
        run: currentRun,
        selected_environment: selectedEnvironment,
        algorithm,
        hyperparameters: {
          learning_rate: learningRate,
          total_timesteps: totalTimesteps,
        },
        metrics,
        reward_history_last_100: rewardHistory,
        insight: currentInsight,
        latest_evaluation_summary: latestEvaluationSummary,
        evaluation_playback_url: evaluationPlaybackUrl,
        playback_error: playbackError,
        events: events.slice(0, 200),
      }

      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      addLocalEvent(`Report generated (${fileName})`, 'success', 'report_generated')
    } catch {
      addLocalEvent('Failed to generate report', 'error', 'error')
    }
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
          playbackVideoUrl={evaluationPlaybackUrl}
          isActive={isActive}
          isStreamConnected={isFramesConnected}
          episode={episode}
          currentReward={currentReward}
          metrics={metrics}
          rewardHistory={rewardHistory}
          algorithmInfo={algorithmExplanations[algorithm]}
          onReset={handleReset}
          onPlaybackError={handlePlaybackError}
        />

        {/* Right Sidebar */}
        <RightSidebar
          insight={currentInsight || undefined}
          events={events}
          onGenerateReport={handleGenerateReport}
          isEventsConnected={isEventsConnected}
          eventsError={eventsError?.message ?? null}
        />
      </main>
    </>
  )
}
