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
import { useEnvironments, useTraining } from '@/hooks'

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
  const { environments, isLoading: isLoadingEnvironments } = useEnvironments()
  
  // Training state management
  const {
    currentRun,
    isCreating,
    isStarting,
    isEvaluating,
    error: trainingError,
    createAndStartTraining,
    evaluate,
    clearError,
  } = useTraining()

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

  // Metrics state
  const [episode, setEpisode] = useState(0)
  const [currentReward, setCurrentReward] = useState(0)
  const [metrics, setMetrics] = useState<Metrics>({
    meanReward: 0,
    episodeLength: 0,
    loss: 0,
    fps: 0,
  })
  const [rewardHistory, setRewardHistory] = useState<number[]>([])

  // Event log state
  const [events, setEvents] = useState<EventLogEntry[]>([])

  // Derive training state from currentRun
  const isTraining = currentRun?.status === 'training' || isCreating || isStarting
  const isTesting = currentRun?.status === 'evaluating' || isEvaluating

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
      
      // Load mock data for demo purposes
      // In a real implementation, this would come from SSE streaming
      setTimeout(() => {
        setEpisode(412)
        setCurrentReward(24.5)
        setMetrics({
          meanReward: 204.2,
          episodeLength: 302,
          loss: 0.021,
          fps: 144,
        })
        setRewardHistory(mockRewardHistory)
        setEvents(mockEvents)
      }, 1000)
      
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

  const handleReset = () => {
    setEpisode(0)
    setCurrentReward(0)
    setMetrics({
      meanReward: 0,
      episodeLength: 0,
      loss: 0,
      fps: 0,
    })
    setRewardHistory([])
    setIsRecording(false)
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
          isTraining={isTraining}
          isTesting={isTesting}
          isCreatingRun={isCreating}
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
          insight={events.length > 0 ? mockInsight : {
            title: 'AWAITING DATA',
            paragraphs: ['Start training to see policy analysis and insights.'],
          }}
          events={events}
          onGenerateReport={handleGenerateReport}
        />
      </main>
    </>
  )
}
