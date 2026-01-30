'use client'

import { useState } from 'react'
import {
  Header,
  LeftSidebar,
  CenterPanel,
  RightSidebar,
  type Environment,
  type Metrics,
  type AlgorithmInfo,
  type AnalysisInsight,
  type EventLogEntry,
} from '@/components'

// Environment configurations matching backend
const environments: Environment[] = [
  { id: '01', name: 'LunarLander-v2', actionSpaceType: 'DISCRETE', obsSpaceDims: 8 },
  { id: '02', name: 'CartPole-v1', actionSpaceType: 'DISCRETE', obsSpaceDims: 4 },
  { id: '03', name: 'BipedalWalker-v3', actionSpaceType: 'CONTINUOUS', obsSpaceDims: 24 },
]

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

// Mock data for initial state
const mockRewardHistory = [
  20, 35, 40, 30, 55, 65, 45, 70, 80, 75, 90, 60, 50, 40, 55, 85, 95, 80, 70, 60,
  65, 55, 45, 35,
]

const mockEvents: EventLogEntry[] = [
  { id: '1', time: '11:04', message: 'Model checkpoint saved (ep_400)', type: 'info' },
  { id: '2', time: '11:03', message: 'Evaluation started: 10 episodes', type: 'info' },
  { id: '3', time: '11:02', message: 'Warning: High variance detected', type: 'warning' },
  { id: '4', time: '11:00', message: 'Training started [PPO]', type: 'info' },
  { id: '5', time: '10:59', message: 'Environment initialized', type: 'success' },
]

const mockInsight: AnalysisInsight = {
  title: 'POLICY BEHAVIOR DETECTED',
  paragraphs: [
    'The agent has converged on a stable hovering strategy. Initial variance in the X-axis has reduced by 40% over the last 50 episodes.',
    'Reward shaping suggests the penalty for thruster usage is currently outweighing the benefit of rapid descent. Consider adjusting <code class="font-mono text-xs bg-surface-secondary px-1 py-0.5 rounded">main_engine_penalty</code>.',
  ],
}

export default function Home() {
  // Environment state
  const [selectedEnvId, setSelectedEnvId] = useState<string>(environments[0].id)

  // Hyperparameters state
  const [algorithm, setAlgorithm] = useState('PPO')
  const [learningRate, setLearningRate] = useState('0.0003')
  const [totalTimesteps, setTotalTimesteps] = useState('1,000,000')

  // Training state
  const [isTraining, setIsTraining] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  // Metrics state
  const [episode, setEpisode] = useState(412)
  const [currentReward, setCurrentReward] = useState(24.5)
  const [metrics, setMetrics] = useState<Metrics>({
    meanReward: 204.2,
    episodeLength: 302,
    loss: 0.021,
    fps: 144,
  })
  const [rewardHistory, setRewardHistory] = useState(mockRewardHistory)

  // Event log state
  const [events, setEvents] = useState<EventLogEntry[]>(mockEvents)

  // Handlers
  const handleTrain = async () => {
    // TODO: Connect to backend API
    setIsTraining(true)
    console.log('Starting training...', {
      environment: selectedEnvId,
      algorithm,
      learningRate,
      totalTimesteps,
    })
  }

  const handleTest = async () => {
    // TODO: Connect to backend API
    setIsTesting(true)
    console.log('Starting test...', { environment: selectedEnvId })
  }

  const handleReset = () => {
    // TODO: Reset training state
    setIsTraining(false)
    setIsTesting(false)
    setIsRecording(false)
    setEpisode(0)
    setCurrentReward(0)
    setMetrics({
      meanReward: 0,
      episodeLength: 0,
      loss: 0,
      fps: 0,
    })
    setRewardHistory([])
  }

  const handleGenerateReport = () => {
    // TODO: Generate and download report
    console.log('Generating report...')
  }

  return (
    <>
      <Header version="v0.0" />

      <main
        className="main-grid flex-1 grid gap-6 h-[calc(100vh-60px)] overflow-hidden p-6 pt-4 bg-surface-secondary"
        style={{ gridTemplateColumns: '280px 1fr 320px' }}
      >
        {/* Left Sidebar */}
        <LeftSidebar
          environments={environments}
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
          isTraining={isTraining}
          isTesting={isTesting}
        />

        {/* Center Panel */}
        <CenterPanel
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
          insight={mockInsight}
          events={events}
          onGenerateReport={handleGenerateReport}
        />
      </main>
    </>
  )
}
