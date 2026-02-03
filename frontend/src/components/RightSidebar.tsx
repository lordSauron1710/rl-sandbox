'use client'

import { AnalysisPanel, AnalysisInsight } from './AnalysisPanel'
import { EventLog, EventLogEntry } from './EventLog'

interface RightSidebarProps {
  insight?: AnalysisInsight
  events: EventLogEntry[]
  onGenerateReport: () => void
  isEventsConnected?: boolean
  eventsError?: string | null
}

export function RightSidebar(props: RightSidebarProps) {
  const {
    insight,
    events,
    onGenerateReport,
    isEventsConnected = false,
    eventsError = null,
  } = props

  return (
    <div className="panel-card col col-right w-[320px] flex-shrink-0">
      <div className="panel-header">
        <span className="label m-0">ANALYSIS & EXPLAINER</span>
      </div>

      <AnalysisPanel insight={insight} onGenerateReport={onGenerateReport} />

      <div className="panel-header border-t border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="label m-0">EVENT LOG</span>
          {eventsError ? (
            <span className="text-[9px] uppercase tracking-wider text-accent-danger">
              stream unavailable
            </span>
          ) : (
            <span
              className={`text-[9px] uppercase tracking-wider ${
                isEventsConnected ? 'text-accent-success' : 'text-text-secondary'
              }`}
            >
              {isEventsConnected ? 'live' : 'idle'}
            </span>
          )}
        </div>
      </div>

      <EventLog events={events} />
    </div>
  )
}

export type { AnalysisInsight } from './AnalysisPanel'
export type { EventLogEntry } from './EventLog'
