'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiEvent, getEventsStreamUrl, listRunEvents } from '@/services/api'

export type EventEntryType = 'info' | 'warning' | 'error' | 'success'

export interface EventLogEntry {
  id: string
  time: string
  timestamp: number
  message: string
  type: EventEntryType
  eventType: string
}

export interface UseEventLogResult {
  events: EventLogEntry[]
  isConnected: boolean
  error: Error | null
  connect: (runId: string) => void
  disconnect: () => void
  clear: () => void
  addLocalEvent: (
    message: string,
    type?: EventEntryType,
    eventType?: string
  ) => void
}

const SUCCESS_EVENT_TYPES = new Set([
  'training_started',
  'training_completed',
  'checkpoint_saved',
  'evaluation_started',
  'evaluation_completed',
  'environment_initialized',
])

function toEventTypeLabel(eventType: string): string {
  if (!eventType) return 'INFO'
  return eventType.replace(/_/g, ' ').toUpperCase()
}

function toEntryType(eventType: string, message: string): EventEntryType {
  const normalized = eventType.toLowerCase()

  if (normalized === 'warning' || message.toLowerCase().includes('warning')) {
    return 'warning'
  }
  if (normalized === 'error' || normalized === 'training_failed') {
    return 'error'
  }
  if (SUCCESS_EVENT_TYPES.has(normalized)) {
    return 'success'
  }
  return 'info'
}

function formatHHMM(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function toTimestamp(isoTimestamp: string | undefined): number {
  if (!isoTimestamp) return Date.now()
  const parsed = Date.parse(isoTimestamp)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function toEntry(event: ApiEvent): EventLogEntry {
  const timestamp = toTimestamp(event.timestamp)
  return {
    id: `backend-${event.id}`,
    time: formatHHMM(timestamp),
    timestamp,
    message: event.message,
    type: toEntryType(event.event_type, event.message),
    eventType: toEventTypeLabel(event.event_type),
  }
}

/**
 * Hook to manage run-scoped event logs from backend SSE + local UI events.
 */
export function useEventLog(): UseEventLogResult {
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const runIdRef = useRef<string | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())

  const insertEntry = useCallback((entry: EventLogEntry) => {
    setEvents((prev) => {
      if (knownIdsRef.current.has(entry.id)) {
        return prev
      }
      knownIdsRef.current.add(entry.id)
      const merged = [entry, ...prev]
      merged.sort((a, b) => b.timestamp - a.timestamp)
      return merged.slice(0, 200)
    })
  }, [])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    runIdRef.current = null
    setIsConnected(false)
  }, [])

  const clear = useCallback(() => {
    knownIdsRef.current.clear()
    setEvents([])
    setError(null)
  }, [])

  const addLocalEvent = useCallback(
    (
      message: string,
      type: EventEntryType = 'info',
      eventType: string = 'local'
    ) => {
      const timestamp = Date.now()
      const id = `local-${timestamp}-${Math.random().toString(36).slice(2, 9)}`
      insertEntry({
        id,
        time: formatHHMM(timestamp),
        timestamp,
        message,
        type,
        eventType: toEventTypeLabel(eventType),
      })
    },
    [insertEntry]
  )

  const connect = useCallback(
    (runId: string) => {
      if (
        runIdRef.current === runId &&
        eventSourceRef.current?.readyState === EventSource.OPEN
      ) {
        return
      }

      const previousRunId = runIdRef.current
      disconnect()
      if (previousRunId && previousRunId !== runId) {
        clear()
      }
      setError(null)
      runIdRef.current = runId

      void listRunEvents(runId, { limit: 50 })
        .then((response) => {
          if (runIdRef.current !== runId) return
          response.events.forEach((event) => {
            insertEntry(toEntry(event))
          })
        })
        .catch((fetchError: unknown) => {
          if (runIdRef.current !== runId) return
          setError(
            fetchError instanceof Error
              ? fetchError
              : new Error('Failed to load event history')
          )
        })

      try {
        const eventSource = new EventSource(getEventsStreamUrl(runId), {
          withCredentials: true,
        })
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          if (runIdRef.current !== runId) return
          setIsConnected(true)
          setError(null)
        }

        eventSource.addEventListener('event', (rawEvent) => {
          if (runIdRef.current !== runId) return
          try {
            const payload = JSON.parse((rawEvent as MessageEvent).data) as ApiEvent
            insertEntry(toEntry(payload))
          } catch {
            // Ignore malformed payloads.
          }
        })

        eventSource.onerror = () => {
          if (runIdRef.current !== runId) return
          if (eventSource.readyState === EventSource.CLOSED) {
            setIsConnected(false)
          }
        }
      } catch (connectError) {
        setError(
          connectError instanceof Error
            ? connectError
            : new Error('Failed to connect to events stream')
        )
        setIsConnected(false)
      }
    },
    [clear, disconnect, insertEntry]
  )

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    events,
    isConnected,
    error,
    connect,
    disconnect,
    clear,
    addLocalEvent,
  }
}
