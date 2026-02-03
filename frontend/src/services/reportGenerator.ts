import type { Metrics } from '@/components'
import type { EventLogEntry } from '@/hooks'
import type { ApiEnvironment, ApiRun, EvaluationSummary } from '@/services/api'
import type { AnalysisInsight } from '@/types/analysis'

export interface ReportInput {
  run: ApiRun | null
  selectedEnvironment: ApiEnvironment | null
  algorithm: string
  hyperparameters: {
    learningRate: string
    totalTimesteps: string
  }
  metrics: Metrics
  rewardHistory: number[]
  insight: AnalysisInsight | null
  latestEvaluationSummary: EvaluationSummary | null
  evaluationPlaybackUrl: string | null
  playbackError: string | null
  events: EventLogEntry[]
}

export interface ReportArtifacts {
  jsonFileName: string
  textFileName: string
  jsonContent: string
  textContent: string
}

export type ReportFormat = 'json' | 'text'

export interface GeneratedReport extends ReportArtifacts {
  id: string
  generatedAt: string
  runId: string | null
  environmentId: string | null
  reportLabel: string
}

interface ReportPayload {
  generated_at: string
  run: ApiRun | null
  selected_environment: ApiEnvironment | null
  algorithm: string
  hyperparameters: {
    learning_rate: string
    total_timesteps: string
  }
  metrics: Metrics
  reward_history_last_100: number[]
  insight: AnalysisInsight | null
  latest_evaluation_summary: EvaluationSummary | null
  evaluation_playback_url: string | null
  playback_error: string | null
  events: EventLogEntry[]
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTimestampTag(generatedAtIso: string): string {
  const parsed = Date.parse(generatedAtIso)
  if (!Number.isFinite(parsed)) {
    return generatedAtIso.replace(/[:.]/g, '-')
  }

  const date = new Date(parsed)
  const year = date.getFullYear().toString()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}-${hour}${minute}`
}

function toReportNameParts(input: ReportInput, generatedAtIso: string): {
  reportLabel: string
  baseFileName: string
} {
  const envId = input.selectedEnvironment?.id ?? input.run?.env_id ?? 'env'
  const algorithm = (input.run?.algorithm ?? input.algorithm ?? 'algo').toUpperCase()
  const runSegment = input.run?.id ? input.run.id.slice(0, 8) : 'session'
  const modelLabel = `model-${runSegment}`
  const timestampTag = toTimestampTag(generatedAtIso)

  const reportLabel = `${envId}-${algorithm}-${modelLabel}-${timestampTag}`
  const baseFileName = `rl-report-${toSlug(envId)}-${toSlug(algorithm)}-${toSlug(
    modelLabel
  )}-${timestampTag}`

  return { reportLabel, baseFileName }
}

function toTextReport(payload: ReportPayload): string {
  const lines: string[] = []
  const insightParagraphs = payload.insight?.paragraphs ?? []
  const latestReward = payload.metrics.meanReward.toFixed(1)

  lines.push('RL Gym Visualizer Report')
  lines.push(`Generated At: ${payload.generated_at}`)
  lines.push(`Run ID: ${payload.run?.id ?? 'N/A'}`)
  lines.push(`Environment: ${payload.selected_environment?.id ?? 'N/A'}`)
  lines.push(`Algorithm: ${payload.algorithm}`)
  lines.push('')
  lines.push('Hyperparameters')
  lines.push(`- learning_rate: ${payload.hyperparameters.learning_rate}`)
  lines.push(`- total_timesteps: ${payload.hyperparameters.total_timesteps}`)
  lines.push('')
  lines.push('Metrics Snapshot')
  lines.push(`- mean_reward: ${latestReward}`)
  lines.push(`- episode_length: ${payload.metrics.episodeLength}`)
  lines.push(`- loss: ${payload.metrics.loss.toFixed(3)}`)
  lines.push(`- fps: ${payload.metrics.fps}`)
  lines.push(`- reward_points: ${payload.reward_history_last_100.length}`)
  lines.push('')
  lines.push('Current Insight')
  lines.push(`- title: ${payload.insight?.title ?? 'No insight available'}`)
  if (insightParagraphs.length > 0) {
    insightParagraphs.forEach((paragraph) => {
      lines.push(`- ${paragraph}`)
    })
  }
  lines.push('')
  lines.push('Evaluation')
  if (payload.latest_evaluation_summary) {
    lines.push(
      `- mean_reward: ${payload.latest_evaluation_summary.mean_reward.toFixed(1)}`
    )
    lines.push(`- episodes: ${payload.latest_evaluation_summary.num_episodes}`)
    lines.push(
      `- video_path: ${payload.latest_evaluation_summary.video_path ?? 'none'}`
    )
  } else {
    lines.push('- summary: none')
  }
  lines.push(`- playback_url: ${payload.evaluation_playback_url ?? 'none'}`)
  lines.push(`- playback_error: ${payload.playback_error ?? 'none'}`)
  lines.push('')
  lines.push(`Event Count: ${payload.events.length}`)
  payload.events.slice(0, 20).forEach((event) => {
    lines.push(`- [${event.time}] (${event.eventType}) ${event.message}`)
  })

  return lines.join('\n')
}

export function createReportArtifacts(
  input: ReportInput,
  generatedAt: Date = new Date()
): ReportArtifacts {
  const generatedAtIso = generatedAt.toISOString()
  const payload: ReportPayload = {
    generated_at: generatedAtIso,
    run: input.run,
    selected_environment: input.selectedEnvironment,
    algorithm: input.algorithm,
    hyperparameters: {
      learning_rate: input.hyperparameters.learningRate,
      total_timesteps: input.hyperparameters.totalTimesteps,
    },
    metrics: input.metrics,
    reward_history_last_100: input.rewardHistory,
    insight: input.insight,
    latest_evaluation_summary: input.latestEvaluationSummary,
    evaluation_playback_url: input.evaluationPlaybackUrl,
    playback_error: input.playbackError,
    events: input.events.slice(0, 200),
  }

  const { baseFileName } = toReportNameParts(input, generatedAtIso)
  return {
    jsonFileName: `${baseFileName}.json`,
    textFileName: `${baseFileName}.txt`,
    jsonContent: JSON.stringify(payload, null, 2),
    textContent: toTextReport(payload),
  }
}

export function buildGeneratedReport(
  input: ReportInput,
  generatedAt: Date = new Date()
): GeneratedReport {
  const generatedAtIso = generatedAt.toISOString()
  const artifacts = createReportArtifacts(input, generatedAt)
  const runId = input.run?.id ?? null
  const environmentId = input.selectedEnvironment?.id ?? null
  const { reportLabel } = toReportNameParts(input, generatedAtIso)

  return {
    id: `${runId ?? 'session'}-${generatedAtIso}`,
    generatedAt: generatedAtIso,
    runId,
    environmentId,
    reportLabel,
    ...artifacts,
  }
}

export function downloadReportFile(
  fileName: string,
  content: string,
  mimeType: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
