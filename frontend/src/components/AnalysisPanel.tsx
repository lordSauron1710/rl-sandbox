'use client'

import type { AnalysisInsight } from '@/types/analysis'

interface AnalysisPanelProps {
  insight?: AnalysisInsight
  onGenerateReport: () => void
  onOpenReports: () => void
  onQuickDownload: () => void
  hasReports: boolean
}

export function AnalysisPanel({
  insight,
  onGenerateReport,
  onOpenReports,
  onQuickDownload,
  hasReports,
}: AnalysisPanelProps) {
  return (
    <div className="p-4 border-b border-border">
      <div className="label text-black mb-2">POLICY BEHAVIOR DETECTED</div>

      {insight ? (
        <>
          <div className="font-mono text-[11px] text-black mb-2">{insight.title}</div>
          {insight.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="font-sans text-[13px] text-text-secondary mb-3 leading-relaxed"
            >
              {paragraph}
            </p>
          ))}
        </>
      ) : (
        <p className="font-sans text-[13px] text-text-secondary leading-relaxed mb-3">
          Start training or evaluation to surface policy behavior notes.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary text-[10px] w-auto px-3"
          onClick={onGenerateReport}
        >
          GENERATE REPORT
        </button>
        <button
          type="button"
          className="btn btn-secondary text-[10px] w-auto px-3 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onOpenReports}
          disabled={!hasReports}
        >
          VIEW
        </button>
        <button
          type="button"
          className="btn btn-secondary w-auto px-2.5 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onQuickDownload}
          disabled={!hasReports}
          aria-label="Download latest report"
          title="Download latest report (JSON)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export type { AnalysisInsight } from '@/types/analysis'
