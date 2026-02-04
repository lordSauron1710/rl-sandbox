'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedReport, ReportFormat } from '@/services/reportGenerator'

interface ReportWorkflowProps {
  isOpen: boolean
  reports: GeneratedReport[]
  onClose: () => void
  onDownload: (report: GeneratedReport, format: ReportFormat) => void
  onDelete: (report: GeneratedReport) => void
  onDeleteAll: () => void
}

const FORMAT_OPTIONS: Array<{
  id: ReportFormat
  viewLabel: string
  downloadLabel: string
}> = [
  { id: 'text', viewLabel: 'View TXT', downloadLabel: 'Download TXT' },
  { id: 'json', viewLabel: 'View JSON', downloadLabel: 'Download JSON' },
]

function formatGeneratedAt(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : isoTimestamp
}

export function ReportWorkflow({
  isOpen,
  reports,
  onClose,
  onDownload,
  onDelete,
  onDeleteAll,
}: ReportWorkflowProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [activeFormat, setActiveFormat] = useState<ReportFormat>('text')
  const previewRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    if (reports.length === 0) {
      setSelectedReportId(null)
      return
    }
    if (!selectedReportId || !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id)
    }
  }, [isOpen, reports, selectedReportId])

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  )
  const activeContent = useMemo(() => {
    if (!selectedReport) return ''
    return activeFormat === 'json' ? selectedReport.jsonContent : selectedReport.textContent
  }, [activeFormat, selectedReport])

  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.scrollTop = 0
    previewRef.current.scrollLeft = 0
  }, [selectedReport?.id, activeFormat])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6 sm:px-8">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-white shadow-xl">
        <div className="panel-header border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="label mb-1">REPORT WORKFLOW</div>
            <p className="text-[11px] text-text-secondary">
              Generate first, then review and download when ready.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary w-auto px-3 py-1.5 text-[10px]"
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 border-t-0 md:grid-cols-[280px_1fr]">
          <div className="border-b border-border p-3 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="label m-0">GENERATED REPORTS</div>
              <button
                type="button"
                className="btn btn-secondary w-auto px-2.5 py-1.5 text-[9px] text-accent-danger disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={onDeleteAll}
                disabled={reports.length === 0}
              >
                DELETE ALL
              </button>
            </div>
            {reports.length === 0 ? (
              <p className="mt-2 text-[12px] text-text-secondary">No reports generated yet.</p>
            ) : (
              <div className="mt-2 max-h-[55vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin md:max-h-[70vh]">
                {reports.map((report) => {
                  const isSelected = report.id === selectedReportId
                  return (
                    <div
                      key={report.id}
                      className={`w-full rounded border px-2 py-2 text-left transition ${
                        isSelected
                          ? 'border-black bg-surface-secondary'
                          : 'border-border hover:border-black/50 hover:bg-surface-secondary'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedReportId(report.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="font-mono text-[11px] text-black break-all">
                            {report.reportLabel}
                          </div>
                          <div className="text-[10px] text-text-secondary">
                            {formatGeneratedAt(report.generatedAt)}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary w-auto px-2.5 py-2 flex-shrink-0"
                          onClick={() => onDelete(report)}
                          aria-label={`Delete ${report.reportLabel}`}
                          title="Delete report"
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
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 p-3">
            {selectedReport ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-border pb-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                    <div className="label mb-1">SELECTED REPORT</div>
                    <div className="font-mono text-[11px] text-black break-all">
                      {selectedReport.reportLabel}
                    </div>
                    <div className="text-[10px] text-text-secondary">
                      {formatGeneratedAt(selectedReport.generatedAt)}
                    </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
                      <div
                        className="inline-flex overflow-hidden rounded-full border border-black"
                        role="tablist"
                        aria-label="Report view format"
                      >
                        {FORMAT_OPTIONS.map((option, index) => (
                          <button
                            key={option.id}
                            type="button"
                            role="tab"
                            aria-selected={activeFormat === option.id}
                            className={`${index === 0 ? '' : 'border-l border-black'} px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
                              activeFormat === option.id
                                ? 'bg-black text-white'
                                : 'bg-white text-black hover:bg-surface-secondary'
                            }`}
                            onClick={() => setActiveFormat(option.id)}
                          >
                            {option.viewLabel}
                          </button>
                        ))}
                      </div>

                      {FORMAT_OPTIONS.map((option) => (
                        <button
                          key={option.downloadLabel}
                          type="button"
                          className="btn btn-secondary w-auto px-3 py-1.5 text-[10px]"
                          onClick={() => onDownload(selectedReport, option.id)}
                        >
                          {option.downloadLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <pre
                  ref={previewRef}
                  key={`${selectedReport.id}-${activeFormat}`}
                  className={`mt-3 min-h-0 flex-1 overflow-auto rounded border border-border bg-surface-secondary p-3 text-[11px] leading-relaxed text-black scrollbar-thin ${
                    activeFormat === 'text' ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                  }`}
                >
                  {activeContent}
                </pre>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-text-secondary">
                Generate a report to start the review/download workflow.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
