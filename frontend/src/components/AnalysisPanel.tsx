'use client'

export interface AnalysisInsight {
  title: string
  paragraphs: string[]
}

interface AnalysisPanelProps {
  insight?: AnalysisInsight
  onGenerateReport: () => void
}

export function AnalysisPanel({ insight, onGenerateReport }: AnalysisPanelProps) {
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

      <button
        type="button"
        className="btn btn-secondary text-[10px] w-auto"
        onClick={onGenerateReport}
      >
        GENERATE REPORT
      </button>
    </div>
  )
}
