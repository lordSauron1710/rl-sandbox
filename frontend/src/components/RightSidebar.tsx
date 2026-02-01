'use client'

export interface AnalysisInsight {
  title: string
  paragraphs: string[]
}

export interface EventLogEntry {
  id: string
  time: string
  timestamp?: number
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
}

interface RightSidebarProps {
  insight?: AnalysisInsight
  events: EventLogEntry[]
  onGenerateReport: () => void
}

export function RightSidebar(props: RightSidebarProps) {
  const { insight, events, onGenerateReport } = props

  const sortedEvents = [...events].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)
  )

  return (
    <div className="panel-card col col-right w-[320px] flex-shrink-0">
      <div className="panel-header">
        <span className="label m-0">ANALYSIS & EXPLAINER</span>
      </div>

      <div className="p-4 border-b border-border">
        {insight ? (
          <>
            <div className="label text-black mb-2">{insight.title}</div>
            {insight.paragraphs.map((paragraph, index) => (
              <p
                key={index}
                className="font-sans text-[13px] text-text-secondary mb-4 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: paragraph }}
              />
            ))}
          </>
        ) : (
          <p className="font-sans text-[13px] text-text-secondary leading-relaxed">
            Start training to see policy analysis and insights.
          </p>
        )}
        <button
          className="btn btn-secondary text-[10px] w-auto"
          onClick={onGenerateReport}
        >
          Generate Report
        </button>
      </div>

      <div className="panel-header border-t border-border">
        <span className="label m-0">EVENT LOG</span>
      </div>

      <div className="px-4 flex-1 overflow-y-auto scrollbar-thin">
        {sortedEvents.length === 0 ? (
          <p className="font-mono text-[11px] text-text-secondary py-2">
            No events yet.
          </p>
        ) : (
          sortedEvents.map((event) => (
            <div
              key={event.id}
              className="font-mono text-[11px] py-2 border-b border-border flex gap-2"
            >
              <span className="text-text-secondary w-[50px] flex-shrink-0">
                {event.time}
              </span>
              <span
                className={
                  event.type === 'warning'
                    ? 'text-accent-danger'
                    : event.type === 'error'
                    ? 'text-accent-danger font-semibold'
                    : event.type === 'success'
                    ? 'text-accent-success'
                    : ''
                }
              >
                {event.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
