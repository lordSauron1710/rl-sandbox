'use client'

export interface AnalysisInsight {
  title: string
  paragraphs: string[]
}

export interface EventLogEntry {
  id: string
  time: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
}

interface RightSidebarProps {
  insight?: AnalysisInsight
  events: EventLogEntry[]
  onGenerateReport: () => void
}

export function RightSidebar({
  insight,
  events,
  onGenerateReport,
}: RightSidebarProps) {
  return (
    <div className="panel-card col col-right w-[320px] flex-shrink-0">
      {/* Analysis Header */}
      <div className="panel-header">
        <span className="label m-0">ANALYSIS & EXPLAINER</span>
      </div>

      {/* Analysis Content */}
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

      {/* Event Log Header */}
      <div className="panel-header border-t border-border">
        <span className="label m-0">EVENT LOG</span>
      </div>

      {/* Event Log Entries */}
      <div className="px-4 flex-1 overflow-y-auto scrollbar-thin">
        {events.length === 0 ? (
          <p className="font-mono text-[11px] text-text-secondary py-2">
            No events yet.
          </p>
        ) : (
          events.map((event) => (
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
