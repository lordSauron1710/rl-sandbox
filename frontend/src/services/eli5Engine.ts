import type { ApiRun } from '@/services/api'

export interface ELI5Explanation {
  title: string
  paragraphs: string[]
}

export interface ELI5Context {
  backendAvailable: boolean
  selectedEnvName: string | null
  algorithm: string
  run: ApiRun | null
  isCreating: boolean
  isStarting: boolean
  isStoppingTraining: boolean
  isStoppingEvaluation: boolean
  isStreamConnected: boolean
  trainingProgressPercent: number
  testingProgressPercent: number
  episode: number
  currentReward: number
  meanReward: number
  rewardHistoryCount: number
  hasPlayback: boolean
  playbackError: string | null
  eventsError: string | null
}

function round(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function asPercent(value: number): number {
  return Math.max(0, Math.min(100, round(value, 0)))
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = round(value, 1)
  return `${rounded >= 0 ? '+' : ''}${rounded}`
}

function brainName(algorithm: string): string {
  if (algorithm === 'DQN') return 'the choice brain (DQN)'
  if (algorithm === 'PPO') return 'the careful brain (PPO)'
  return `the ${algorithm} brain`
}

export function buildEli5Explanation(context: ELI5Context): ELI5Explanation {
  const world = context.selectedEnvName ?? 'this world'
  const status = context.run?.status ?? null

  if (!context.backendAvailable) {
    return {
      title: 'Our helper is sleeping',
      paragraphs: [
        'The app helper is not awake yet, so we cannot train or test right now.',
        'Start the backend, then we can watch the game and teach the little robot brain.',
      ],
    }
  }

  if (!context.selectedEnvName) {
    return {
      title: 'Pick a world first',
      paragraphs: [
        'Choose a world on the left. That is the playground for our robot.',
        'After that, we can teach it, test it, and watch what it does.',
      ],
    }
  }

  if (context.playbackError) {
    return {
      title: 'Video had a hiccup',
      paragraphs: [
        `Training may be fine, but we could not play the latest test video for ${world}.`,
        'Try running test again or refreshing the page.',
      ],
    }
  }

  if (context.eventsError) {
    return {
      title: 'The message stream is quiet',
      paragraphs: [
        'The event messages are not coming in right now.',
        'The run can still work, but the log updates may look delayed.',
      ],
    }
  }

  if (context.isCreating || context.isStarting || status === 'pending') {
    return {
      title: 'Getting ready',
      paragraphs: [
        `We are setting up ${brainName(context.algorithm)} in ${world}.`,
        'Think of this like putting on shoes before a race starts.',
      ],
    }
  }

  if (context.isStoppingTraining || context.isStoppingEvaluation) {
    return {
      title: 'Stopping now',
      paragraphs: [
        'We asked the run to stop. It is finishing its current tiny step.',
        'In a moment, it will pause and save where it got to.',
      ],
    }
  }

  if (!context.run) {
    return {
      title: 'Ready to play',
      paragraphs: [
        `${world} is ready. Press TRAIN to teach, or TEST when you have a trained model.`,
        'Nothing is running yet, so this is a calm waiting state.',
      ],
    }
  }

  if (status === 'training') {
    const progress = asPercent(context.trainingProgressPercent)
    return {
      title: 'We are teaching the robot',
      paragraphs: [
        `In ${world}, ${brainName(context.algorithm)} is practicing over and over.`,
        `It is about ${progress}% done. We are around round ${Math.max(0, context.episode)}.`,
        `Latest score is ${signed(context.currentReward)} and average score is ${round(context.meanReward, 1)}.`,
        context.isStreamConnected
          ? 'The live picture is connected, so you can watch it learn right now.'
          : 'The live picture is still connecting, but learning is still happening.',
      ],
    }
  }

  if (status === 'evaluating') {
    const progress = asPercent(context.testingProgressPercent)
    return {
      title: 'Now we are giving it a test',
      paragraphs: [
        `The robot is taking a test in ${world}.`,
        `Test progress is about ${progress}% and we are watching round ${Math.max(0, context.episode)}.`,
        'During test time, it just shows what it learned. It is not learning new tricks.',
      ],
    }
  }

  if (status === 'completed') {
    return {
      title: 'Training finished',
      paragraphs: [
        `The training run in ${world} is done. Great job, robot brain!`,
        `It ended with average score ${round(context.meanReward, 1)} after ${context.rewardHistoryCount} score points.`,
        context.hasPlayback
          ? 'You can watch the saved test video in the live feed area.'
          : 'You can press TEST to see how well it performs now.',
      ],
    }
  }

  if (status === 'stopped') {
    return {
      title: 'Paused',
      paragraphs: [
        'The run is paused on purpose and saved.',
        'You can start again from here, or reset and begin a fresh run.',
      ],
    }
  }

  if (status === 'failed') {
    return {
      title: 'Something got stuck',
      paragraphs: [
        'This run hit an error and stopped.',
        'Check the event log on the right, then try again with a new run.',
      ],
    }
  }

  return {
    title: 'Here is what is happening',
    paragraphs: [
      `The app is in "${status}" mode for ${world}.`,
      'If this looks odd, check the event log for the latest message.',
    ],
  }
}
