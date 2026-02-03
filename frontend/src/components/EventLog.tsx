'use client'

import { useMemo } from 'react'

export interface EventLogEntry {
  id: string
  time: string
  timestamp: number
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  eventType: string
}

interface EventLogProps {
  events: EventLogEntry[]
}

function entryTone(type: EventLogEntry['type']): string {
  if (type === 'warning') return 'text-accent-danger'
  if (type === 'error') return 'text-accent-danger font-semibold'
  if (type === 'success') return 'text-accent-success'
  return 'text-black'
}

export function EventLog({ events }: EventLogProps) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.timestamp - a.timestamp),
    [events]
  )

  return (
    <div className="px-4 flex-1 overflow-y-auto scrollbar-thin">
      {sortedEvents.length === 0 ? (
        <p className="font-mono text-[11px] text-text-secondary py-2">No events yet.</p>
      ) : (
        sortedEvents.map((event) => (
          <div
            key={event.id}
            className="font-mono text-[11px] py-2 border-b border-border flex gap-2"
          >
            <span className="text-text-secondary w-[50px] flex-shrink-0">{event.time}</span>
            <span className="text-[9px] uppercase tracking-wide text-text-secondary w-[74px] flex-shrink-0">
              {event.eventType}
            </span>
            <span className={entryTone(event.type)}>{event.message}</span>
          </div>
        ))
      )}
    </div>
  )
}
