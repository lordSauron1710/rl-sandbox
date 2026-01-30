/**
 * API client configuration and utilities for RL Gym Visualizer
 */

// API base URL - defaults to localhost:8000 for development
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

/**
 * Environment metadata from the backend
 */
export interface ApiEnvironment {
  id: string
  name: string
  display_id: string
  action_space_type: 'Discrete' | 'Continuous'
  action_space_size: number
  obs_space_type: string
  obs_space_dims: number
  description: string
  supported_algorithms: string[]
}

/**
 * Run configuration
 */
export interface RunConfig {
  env_id: string
  algorithm: string
  hyperparameters: {
    learning_rate: number
    total_timesteps: number
  }
  seed?: number
}

/**
 * Run from the backend
 */
export interface ApiRun {
  id: string
  env_id: string
  algorithm: string
  status: 'pending' | 'training' | 'completed' | 'stopped' | 'failed' | 'evaluating'
  config: RunConfig
  progress?: {
    current_timestep: number
    total_timesteps: number
    percent_complete: number
    episodes_completed: number
  }
  latest_metrics?: {
    episode: number
    reward: number
    length: number
    loss: number | null
    fps: number
  }
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

/**
 * Fetch all environments from the backend
 */
export async function fetchEnvironments(): Promise<ApiEnvironment[]> {
  const response = await fetch(`${API_BASE_URL}/environments`)
  if (!response.ok) {
    throw new Error(`Failed to fetch environments: ${response.statusText}`)
  }
  const data = await response.json()
  return data.environments
}

/**
 * Create a new run
 */
export async function createRun(config: RunConfig): Promise<ApiRun> {
  const response = await fetch(`${API_BASE_URL}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || `Failed to create run: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Start training for a run
 */
export async function startTraining(runId: string): Promise<{ id: string; status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/runs/${runId}/start`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || `Failed to start training: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Stop training for a run
 */
export async function stopTraining(runId: string): Promise<{ id: string; status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/runs/${runId}/stop`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || `Failed to stop training: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Trigger evaluation for a run
 */
export async function triggerEvaluation(
  runId: string,
  nEpisodes: number = 10,
  streamFrames: boolean = true
): Promise<{ id: string; status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/runs/${runId}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      num_episodes: nEpisodes,
      stream_frames: streamFrames,
      target_fps: 15,
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || `Failed to trigger evaluation: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get run details
 */
export async function getRun(runId: string): Promise<ApiRun> {
  const response = await fetch(`${API_BASE_URL}/runs/${runId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch run: ${response.statusText}`)
  }
  return response.json()
}

/**
 * List all runs
 */
export async function listRuns(params?: {
  status?: string
  env_id?: string
  limit?: number
  offset?: number
}): Promise<{ runs: ApiRun[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.env_id) searchParams.set('env_id', params.env_id)
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())

  const url = `${API_BASE_URL}/runs${searchParams.toString() ? `?${searchParams}` : ''}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to list runs: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get environment preview image URL
 * Returns a URL that can be used as an img src
 */
export function getEnvironmentPreviewUrl(envId: string): string {
  return `${API_BASE_URL}/environments/${encodeURIComponent(envId)}/preview`
}

/**
 * Metrics data from SSE stream
 */
export interface MetricsData {
  episode: number
  reward: number
  length: number
  loss: number | null
  fps: number
  timestamp: string
}

/**
 * Frame data from WebSocket stream
 */
export interface FrameData {
  type: 'frame'
  data: string  // base64 encoded JPEG
  timestamp: string
  episode: number
  step: number
  reward: number
  total_reward: number
}

/**
 * Get the WebSocket URL for frame streaming
 */
export function getFramesWebSocketUrl(runId: string, fps: number = 15): string {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws')
  return `${wsBase}/runs/${runId}/ws/frames?fps=${fps}`
}

/**
 * Get the SSE URL for metrics streaming
 */
export function getMetricsStreamUrl(runId: string): string {
  return `${API_BASE_URL}/runs/${runId}/stream/metrics`
}

/**
 * Get the SSE URL for events streaming
 */
export function getEventsStreamUrl(runId: string): string {
  return `${API_BASE_URL}/runs/${runId}/stream/events`
}
