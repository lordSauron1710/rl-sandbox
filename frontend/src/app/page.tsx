'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessGate,
  Header,
  LeftSidebar,
  CenterPanel,
  RightSidebar,
  ReportWorkflow,
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
  API_BASE_URL,
  AlgorithmName,
  AlgorithmPresetTable,
  EvaluationSummary,
  PresetName,
  createSession,
  fetchRunPresets,
  getLatestEvaluation,
  getSessionStatus,
  getLatestEvaluationVideoUrl,
  toAbsoluteApiUrl,
} from '@/services/api'
import { buildAnalysisInsight } from '@/services/insightsEngine'
import { buildEli5Explanation } from '@/services/eli5Engine'
import {
  buildGeneratedReport,
  downloadReportFile,
  type GeneratedReport,
  type ReportFormat,
} from '@/services/reportGenerator'

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

const algorithmExplanationsEli5: Record<string, AlgorithmInfo> = {
  PPO: {
    name: 'Careful learner (PPO)',
    intuition:
      'This brain learns by trying things, but only changes a little bit each time so it does not forget how to do the task.',
    keyIdea: 'Take small safe learning steps',
    bestFor: 'Tasks where smooth, steady learning helps',
  },
  DQN: {
    name: 'Score-picker brain (DQN)',
    intuition:
      'This brain gives each action a score and picks the action with the best score.',
    keyIdea: 'Pick actions with the highest learned score',
    bestFor: 'Tasks with a small list of clear choices',
  },
}

const DEFAULT_LEARNING_RATE = '0.0003'
const DEFAULT_TOTAL_TIMESTEPS = '1,000,000'
const DEFAULT_EVAL_EPISODES = 10
const DEFAULT_PRESET: PresetName = 'stable'

/**
 * Parse timesteps string (with commas) to number
 */
function parseTimesteps(value: string): number {
  return parseInt(value.replace(/,/g, ''), 10) || 1000000
}

function formatTimesteps(value: number): string {
  return Math.max(1, Math.floor(value)).toLocaleString('en-US')
}

function clampPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value as number))
}

function Dashboard() {
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
  const [algorithm, setAlgorithm] = useState<AlgorithmName>('PPO')
  const [selectedPreset, setSelectedPreset] = useState<PresetName>(DEFAULT_PRESET)
  const [learningRate, setLearningRate] = useState(DEFAULT_LEARNING_RATE)
  const [totalTimesteps, setTotalTimesteps] = useState(DEFAULT_TOTAL_TIMESTEPS)
  const [presetTables, setPresetTables] = useState<
    Partial<Record<AlgorithmName, AlgorithmPresetTable>>
  >({})
  const [isLoadingPresets, setIsLoadingPresets] = useState(false)
  const [presetsError, setPresetsError] = useState<string | null>(null)

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
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([])
  const [isReportWorkflowOpen, setIsReportWorkflowOpen] = useState(false)
  const [isEli5Enabled, setIsEli5Enabled] = useState(false)

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvId) ?? null,
    [environments, selectedEnvId]
  )
  const activePresetTable = presetTables[algorithm] ?? null
  const presetOptions = useMemo(() => {
    if (!activePresetTable) return []
    const order: PresetName[] = ['fast', 'stable', 'high_score']
    return order
      .map((presetName) => {
        const entry = activePresetTable.presets[presetName]
        if (!entry) return null
        return {
          id: presetName,
          label: entry.label,
          description: entry.description,
        }
      })
      .filter((entry): entry is { id: PresetName; label: string; description: string } => entry !== null)
  }, [activePresetTable])
  const currentRunIdRef = useRef<string | null>(null)
  const previousRunStatusRef = useRef<string | null>(null)
  const evaluationRequestedAtRef = useRef<number | null>(null)
  const evaluationFetchInFlightRef = useRef(false)
  const hasAppliedInitialPresetRef = useRef(false)
  const previousAlgorithmRef = useRef<AlgorithmName>(algorithm)

  const applyPresetToForm = useCallback(
    (presetName: PresetName, targetAlgorithm: AlgorithmName) => {
      const table = presetTables[targetAlgorithm]
      const preset = table?.presets?.[presetName]
      if (!preset) return
      setLearningRate(String(preset.hyperparameters.learning_rate))
      setTotalTimesteps(formatTimesteps(preset.hyperparameters.total_timesteps))
    },
    [presetTables]
  )

  useEffect(() => {
    let isCancelled = false

    const loadPresets = async () => {
      setIsLoadingPresets(true)
      try {
        const tables = await fetchRunPresets()
        if (isCancelled) return

        const mapped: Partial<Record<AlgorithmName, AlgorithmPresetTable>> = {}
        for (const table of tables) {
          mapped[table.algorithm] = table
        }
        setPresetTables(mapped)
        setPresetsError(null)
      } catch (err) {
        if (isCancelled) return
        const message =
          err instanceof Error ? err.message : 'Failed to load preset defaults'
        setPresetsError(message)
      } finally {
        if (!isCancelled) {
          setIsLoadingPresets(false)
        }
      }
    }

    void loadPresets()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activePresetTable) return

    const validPreset =
      activePresetTable.presets[selectedPreset] !== undefined
        ? selectedPreset
        : activePresetTable.default_preset

    if (validPreset !== selectedPreset) {
      setSelectedPreset(validPreset)
      return
    }

    if (!hasAppliedInitialPresetRef.current) {
      applyPresetToForm(validPreset, algorithm)
      hasAppliedInitialPresetRef.current = true
    }
  }, [activePresetTable, algorithm, applyPresetToForm, selectedPreset])

  useEffect(() => {
    if (!activePresetTable) return
    if (previousAlgorithmRef.current === algorithm) return

    const validPreset =
      activePresetTable.presets[selectedPreset] !== undefined
        ? selectedPreset
        : activePresetTable.default_preset

    if (validPreset !== selectedPreset) {
      setSelectedPreset(validPreset)
    }
    applyPresetToForm(validPreset, algorithm)
    previousAlgorithmRef.current = algorithm
  }, [activePresetTable, algorithm, applyPresetToForm, selectedPreset])

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

  const trainingProgressPercent = clampPercent(
    currentRun?.status === 'completed' ? 100 : currentRun?.progress?.percent_complete
  )
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
        learningRate,
        totalTimesteps,
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
      learningRate,
      totalTimesteps,
    ]
  )

  const eli5Insight = useMemo(() => {
    if (!isEli5Enabled) return null
    return buildEli5Explanation({
      backendAvailable: !environmentsError,
      selectedEnvName: selectedEnvironment?.name ?? null,
      algorithm,
      run: currentRun,
      isCreating,
      isStarting,
      isStoppingTraining,
      isStoppingEvaluation,
      isStreamConnected: isFramesConnected,
      trainingProgressPercent,
      testingProgressPercent,
      episode,
      currentReward,
      meanReward: metrics.meanReward,
      rewardHistoryCount: rewardHistory.length,
      hasPlayback: Boolean(evaluationPlaybackUrl),
      playbackError,
      eventsError: eventsError?.message ?? null,
    })
  }, [
    isEli5Enabled,
    environmentsError,
    selectedEnvironment?.name,
    algorithm,
    currentRun,
    isCreating,
    isStarting,
    isStoppingTraining,
    isStoppingEvaluation,
    isFramesConnected,
    trainingProgressPercent,
    testingProgressPercent,
    episode,
    currentReward,
    metrics.meanReward,
    rewardHistory.length,
    evaluationPlaybackUrl,
    playbackError,
    eventsError,
  ])

  const handleEli5Toggle = useCallback(() => {
    setIsEli5Enabled((prev) => {
      const next = !prev
      addLocalEvent(
        next ? 'ELI5 explainer enabled' : 'ELI5 explainer hidden',
        'info',
        'eli5_toggled'
      )
      return next
    })
  }, [addLocalEvent])

  const handlePlaybackError = useCallback(() => {
    if (!playbackError) {
      addLocalEvent('Evaluation playback unavailable.', 'warning', 'warning')
    }
    setPlaybackError('Failed to load evaluation playback.')
  }, [addLocalEvent, playbackError])

  const handlePresetChange = useCallback(
    (preset: PresetName) => {
      setSelectedPreset(preset)
      applyPresetToForm(preset, algorithm)
    },
    [algorithm, applyPresetToForm]
  )

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
          preset: selectedPreset,
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
    setSelectedPreset(DEFAULT_PRESET)
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
      const report = buildGeneratedReport({
        run: currentRun,
        selectedEnvironment,
        algorithm,
        hyperparameters: {
          learningRate,
          totalTimesteps,
        },
        metrics,
        rewardHistory,
        insight: isEli5Enabled && eli5Insight ? eli5Insight : currentInsight,
        latestEvaluationSummary,
        evaluationPlaybackUrl,
        playbackError,
        events,
      })
      setGeneratedReports((prev) => [report, ...prev].slice(0, 25))

      addLocalEvent(
        `Report generated: ${report.reportLabel}. Use VIEW to inspect or the download icon for quick export.`,
        'success',
        'report_generated'
      )
    } catch {
      addLocalEvent('Failed to generate report', 'error', 'error')
    }
  }

  const handleOpenReports = useCallback(() => {
    if (generatedReports.length === 0) {
      addLocalEvent('No generated reports yet. Click GENERATE REPORT first.', 'warning', 'warning')
      return
    }
    setIsReportWorkflowOpen(true)
  }, [addLocalEvent, generatedReports.length])

  const handleDownloadReport = useCallback(
    (report: GeneratedReport, format: ReportFormat) => {
      if (format === 'json') {
        downloadReportFile(report.jsonFileName, report.jsonContent, 'application/json')
        addLocalEvent(`Downloaded ${report.jsonFileName}`, 'info', 'report_downloaded')
        return
      }
      downloadReportFile(report.textFileName, report.textContent, 'text/plain;charset=utf-8')
      addLocalEvent(`Downloaded ${report.textFileName}`, 'info', 'report_downloaded')
    },
    [addLocalEvent]
  )

  const handleQuickDownloadLatest = useCallback(() => {
    const latest = generatedReports[0]
    if (!latest) {
      addLocalEvent('No generated reports yet. Click GENERATE REPORT first.', 'warning', 'warning')
      return
    }
    handleDownloadReport(latest, 'json')
  }, [addLocalEvent, generatedReports, handleDownloadReport])

  const handleDeleteReport = useCallback(
    (report: GeneratedReport) => {
      const confirmed = window.confirm(`Delete report "${report.reportLabel}"?`)
      if (!confirmed) return

      setGeneratedReports((prev) => prev.filter((candidate) => candidate.id !== report.id))
      addLocalEvent(`Deleted report: ${report.reportLabel}`, 'info', 'report_deleted')
    },
    [addLocalEvent]
  )

  const handleDeleteAllReports = useCallback(() => {
    if (generatedReports.length === 0) {
      addLocalEvent('No reports to delete.', 'warning', 'warning')
      return
    }

    const confirmed = window.confirm(`Delete all ${generatedReports.length} generated reports?`)
    if (!confirmed) return

    const count = generatedReports.length
    setGeneratedReports([])
    addLocalEvent(`Deleted all reports (${count}).`, 'info', 'report_deleted')
  }, [addLocalEvent, generatedReports])

  return (
    <>
      <Header version="v0.0" />

      {/* Backend unreachable banner */}
      {environmentsError && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Backend not reachable.</span> If you are running locally, start it with{' '}
            <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-xs">make backend</code>. If you are on a hosted demo, run the full app locally with{' '}
            <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-xs">make install && make dev</code>.
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
          selectedPreset={selectedPreset}
          onPresetChange={handlePresetChange}
          presetOptions={presetOptions}
          isLoadingPresets={isLoadingPresets}
          presetsError={presetsError}
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
          algorithmInfo={
            isEli5Enabled
              ? algorithmExplanationsEli5[algorithm]
              : algorithmExplanations[algorithm]
          }
          onReset={handleReset}
          onEli5Toggle={handleEli5Toggle}
          isEli5Enabled={isEli5Enabled}
          onPlaybackError={handlePlaybackError}
        />

        {/* Right Sidebar */}
        <RightSidebar
          insight={currentInsight || undefined}
          eli5Insight={eli5Insight}
          isEli5Enabled={isEli5Enabled}
          events={events}
          onGenerateReport={handleGenerateReport}
          onOpenReports={handleOpenReports}
          onQuickDownload={handleQuickDownloadLatest}
          hasReports={generatedReports.length > 0}
          isEventsConnected={isEventsConnected}
          eventsError={eventsError?.message ?? null}
        />
      </main>

      <ReportWorkflow
        isOpen={isReportWorkflowOpen}
        reports={generatedReports}
        onClose={() => setIsReportWorkflowOpen(false)}
        onDownload={handleDownloadReport}
        onDelete={handleDeleteReport}
        onDeleteAll={handleDeleteAllReports}
      />
    </>
  )
}

type AccessState = 'checking' | 'locked' | 'ready'

export default function Home() {
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [accessError, setAccessError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)

  useEffect(() => {
    let isCancelled = false

    const checkSession = async () => {
      try {
        const session = await getSessionStatus()
        if (isCancelled) return
        setAccessError(null)
        setAccessState(
          session.access_control_enabled && !session.authenticated ? 'locked' : 'ready'
        )
      } catch {
        if (isCancelled) return
        // Preserve the frontend-only demo behavior if the backend is unreachable.
        setAccessState('ready')
      }
    }

    void checkSession()

    return () => {
      isCancelled = true
    }
  }, [])

  const handleUnlock = useCallback(async (token: string) => {
    setIsUnlocking(true)
    setAccessError(null)
    try {
      const session = await createSession(token)
      if (session.access_control_enabled && !session.authenticated) {
        throw new Error('Backend session was not established.')
      }
      setAccessState('ready')
    } catch (err) {
      setAccessError(
        err instanceof Error ? err.message : 'Failed to unlock the backend session'
      )
    } finally {
      setIsUnlocking(false)
    }
  }, [])

  if (accessState === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-secondary px-6 py-10 text-primary">
        <div className="rounded-3xl border border-border bg-surface px-8 py-6 text-sm text-secondary shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          Checking backend access...
        </div>
      </main>
    )
  }

  if (accessState === 'locked') {
    return (
      <AccessGate
        apiBaseUrl={API_BASE_URL}
        error={accessError}
        isSubmitting={isUnlocking}
        onSubmit={handleUnlock}
      />
    )
  }

  return <Dashboard />
}
