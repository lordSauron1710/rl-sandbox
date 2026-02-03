import type { AnalysisInsight } from '@/types/analysis'

export type ActionSpaceType = 'Discrete' | 'Continuous' | 'Unknown'

export interface InsightTemplateInput {
  algorithm: string
  envLabel: string
  actionSpaceType: ActionSpaceType
  progressPercent: number
  windowSize: number
  recentMean: number
  previousMean: number
  deltaMean: number
  recentStdDev: number
  varianceReductionPercent: number
  meanReward: number
  episodeLength: number
  fps: number
  learningRate: string
  totalTimesteps: string
  currentEvalEpisode: number
  totalEvalEpisodes: number
}

export type InsightTemplateId =
  | 'exploration'
  | 'convergence'
  | 'variance_tracking'
  | 'reward_shaping'
  | 'failure_detection'
  | 'evaluation'

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function toVarianceSentence(varianceReductionPercent: number, windowSize: number): string {
  if (varianceReductionPercent >= 0) {
    return `Variance reduced by ${varianceReductionPercent.toFixed(1)}% over last ${windowSize} episodes.`
  }
  return `Variance increased by ${Math.abs(varianceReductionPercent).toFixed(1)}% over last ${windowSize} episodes.`
}

const templateBuilders: Record<
  InsightTemplateId,
  (input: InsightTemplateInput) => AnalysisInsight
> = {
  exploration: (input) => ({
    title: 'EXPLORATION PHASE',
    paragraphs: [
      `${input.algorithm} on ${input.envLabel} is still in early exploration (${input.progressPercent.toFixed(0)}% progress).`,
      `Current telemetry: mean reward ${input.meanReward.toFixed(1)}, episode length ${input.episodeLength}, stream FPS ${input.fps}.`,
      'Collect at least 10 episodes before applying hyperparameter changes.',
    ],
  }),
  convergence: (input) => ({
    title: 'CONVERGENCE DETECTED',
    paragraphs: [
      'Agent has converged on a stable strategy.',
      `${toVarianceSentence(input.varianceReductionPercent, input.windowSize)} Mean reward is ${input.recentMean.toFixed(1)} (${signed(input.deltaMean)} vs prior window).`,
      `Consider adjusting total_timesteps (currently ${input.totalTimesteps}) upward to verify policy stability over longer horizons.`,
    ],
  }),
  variance_tracking: (input) => ({
    title: 'VARIANCE TRACKING',
    paragraphs: [
      toVarianceSentence(input.varianceReductionPercent, input.windowSize),
      `Recent reward mean is ${input.recentMean.toFixed(1)} (${signed(input.deltaMean)} vs prior window), with std ${input.recentStdDev.toFixed(1)}.`,
      `Consider adjusting learning_rate (currently ${input.learningRate}) to keep variance trending downward.`,
    ],
  }),
  reward_shaping: (input) => {
    const hyperparameter =
      input.actionSpaceType === 'Continuous' ? 'learning_rate' : 'total_timesteps'
    const currentValue =
      hyperparameter === 'learning_rate' ? input.learningRate : input.totalTimesteps
    return {
      title: 'REWARD SHAPING HINT',
      paragraphs: [
        `Policy updates remain noisy for ${input.algorithm} on ${input.envLabel}, so reward shaping opportunities are still open.`,
        `Recent reward mean is ${input.recentMean.toFixed(1)} (${signed(input.deltaMean)} vs prior window) and std is ${input.recentStdDev.toFixed(1)}.`,
        `Consider adjusting ${hyperparameter} (currently ${currentValue}) and re-running for another ${input.windowSize} episodes.`,
      ],
    }
  },
  failure_detection: (input) => ({
    title: 'TRAINING STALL DETECTED',
    paragraphs: [
      'Training may be stuck, try different learning rate.',
      `Recent reward mean (${input.recentMean.toFixed(1)}) regressed ${Math.abs(input.deltaMean).toFixed(1)} points with std ${input.recentStdDev.toFixed(1)} over ${input.windowSize} episodes.`,
      `Consider adjusting learning_rate (currently ${input.learningRate}) and increasing total_timesteps beyond ${input.totalTimesteps}.`,
    ],
  }),
  evaluation: (input) => ({
    title: 'GENERALIZATION CHECK',
    paragraphs: [
      `Evaluation progress: ${input.currentEvalEpisode}/${Math.max(1, input.totalEvalEpisodes)} episodes (${input.progressPercent.toFixed(0)}%).`,
      `${toVarianceSentence(input.varianceReductionPercent, input.windowSize)} Recent reward mean is ${input.recentMean.toFixed(1)} for ${input.envLabel}.`,
      input.varianceReductionPercent < 0
        ? 'Consider adjusting learning_rate before the next evaluation pass.'
        : 'Policy behavior looks consistent; extend evaluation episodes to increase confidence.',
    ],
  }),
}

export function renderInsightTemplate(
  id: InsightTemplateId,
  input: InsightTemplateInput
): AnalysisInsight {
  return templateBuilders[id](input)
}
