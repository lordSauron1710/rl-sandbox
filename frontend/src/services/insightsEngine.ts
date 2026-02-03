import type { ApiRun } from '@/services/api'
import type { AnalysisInsight } from '@/types/analysis'
import {
  renderInsightTemplate,
  type ActionSpaceType,
  type InsightTemplateInput,
} from '@/services/insightTemplates'

export interface InsightContext {
  run: ApiRun | null
  envLabel: string
  actionSpaceType: ActionSpaceType
  algorithm: string
  rewardHistory: number[]
  meanReward: number
  episodeLength: number
  fps: number
  trainingProgressPercent: number
  testingProgressPercent: number
  currentEvalEpisode: number
  totalEvalEpisodes: number
  learningRate: string
  totalTimesteps: string
}

interface InsightStats {
  windowSize: number
  recentMean: number
  previousMean: number
  deltaMean: number
  recentStdDev: number
  varianceReductionPercent: number
}

const MIN_EPISODES_FOR_RULES = 8

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
}

function buildStats(rewardHistory: number[]): InsightStats {
  const maxWindow = Math.min(20, Math.max(6, Math.floor(rewardHistory.length / 2)))
  const windowSize = Math.max(1, Math.min(maxWindow, rewardHistory.length))
  const recentWindow = rewardHistory.slice(-windowSize)
  const previousWindow = rewardHistory.slice(-windowSize * 2, -windowSize)

  const recentMean = mean(recentWindow)
  const previousMean = previousWindow.length > 0 ? mean(previousWindow) : recentMean
  const deltaMean = recentMean - previousMean

  const recentVariance = variance(recentWindow)
  const previousVariance =
    previousWindow.length > 1 ? variance(previousWindow) : recentVariance

  const varianceReductionPercent =
    previousVariance > 0
      ? ((previousVariance - recentVariance) / previousVariance) * 100
      : 0

  return {
    windowSize,
    recentMean,
    previousMean,
    deltaMean,
    recentStdDev: Math.sqrt(Math.max(0, recentVariance)),
    varianceReductionPercent,
  }
}

function buildTemplateInput(
  context: InsightContext,
  progressPercent: number,
  stats: InsightStats
): InsightTemplateInput {
  return {
    algorithm: context.algorithm,
    envLabel: context.envLabel,
    actionSpaceType: context.actionSpaceType,
    progressPercent: clampPercent(progressPercent),
    windowSize: stats.windowSize,
    recentMean: stats.recentMean,
    previousMean: stats.previousMean,
    deltaMean: stats.deltaMean,
    recentStdDev: stats.recentStdDev,
    varianceReductionPercent: stats.varianceReductionPercent,
    meanReward: context.meanReward,
    episodeLength: context.episodeLength,
    fps: context.fps,
    learningRate: context.learningRate,
    totalTimesteps: context.totalTimesteps,
    currentEvalEpisode: context.currentEvalEpisode,
    totalEvalEpisodes: context.totalEvalEpisodes,
  }
}

export function buildAnalysisInsight(context: InsightContext): AnalysisInsight | null {
  if (!context.run) {
    return null
  }

  const isEvaluating = context.run.status === 'evaluating'
  const progressPercent = isEvaluating
    ? context.testingProgressPercent
    : context.trainingProgressPercent
  const stats = buildStats(context.rewardHistory)
  const input = buildTemplateInput(context, progressPercent, stats)

  if (isEvaluating) {
    return renderInsightTemplate('evaluation', input)
  }

  if (context.rewardHistory.length < MIN_EPISODES_FOR_RULES) {
    return renderInsightTemplate('exploration', input)
  }

  const stableDeltaThreshold = Math.max(1.2, Math.abs(stats.recentMean) * 0.07)
  const stableStdThreshold = Math.max(2, Math.abs(stats.recentMean) * 0.11)
  const highStdThreshold = Math.max(6, Math.abs(stats.recentMean) * 0.3)

  const isConverged =
    progressPercent >= 40 &&
    Math.abs(stats.deltaMean) <= stableDeltaThreshold &&
    stats.recentStdDev <= stableStdThreshold &&
    stats.varianceReductionPercent >= 10

  const isFailurePattern =
    progressPercent >= 30 &&
    stats.deltaMean <= -Math.max(1, Math.abs(stats.previousMean) * 0.05) &&
    stats.recentStdDev >= highStdThreshold * 0.6

  const hasVarianceReduction =
    context.rewardHistory.length >= stats.windowSize * 2 &&
    stats.varianceReductionPercent >= 15

  if (isFailurePattern) {
    return renderInsightTemplate('failure_detection', input)
  }

  if (isConverged) {
    return renderInsightTemplate('convergence', input)
  }

  if (hasVarianceReduction) {
    return renderInsightTemplate('variance_tracking', input)
  }

  return renderInsightTemplate('reward_shaping', input)
}
