'use client'

import { FormEvent, useState } from 'react'

interface AccessGateProps {
  apiBaseUrl: string
  error: string | null
  isSubmitting: boolean
  onSubmit: (token: string) => Promise<void>
}

export function AccessGate({
  apiBaseUrl,
  error,
  isSubmitting,
  onSubmit,
}: AccessGateProps) {
  const [token, setToken] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token.trim() || isSubmitting) return
    await onSubmit(token.trim())
  }

  return (
    <main className="min-h-screen bg-surface-secondary px-6 py-10 text-primary">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-border bg-surface p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-secondary">
              Deployment Access
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Backend session required</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">
              This frontend is deployed publicly, but the backend is protected with a
              deployment access token. Enter the token configured on the backend host
              to unlock training, evaluation, SSE, and WebSocket access.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-primary">
                Deployment access token
              </span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-2xl border border-border bg-surface-secondary px-4 py-3 text-sm outline-none transition focus:border-accent"
                placeholder="Paste the RLV_ACCESS_TOKEN value"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || token.trim().length === 0}
              className="btn btn-primary min-w-[180px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Unlocking...' : 'Unlock Backend'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-8 rounded-2xl border border-border bg-surface-secondary/80 px-4 py-4 text-sm text-secondary">
            <p className="font-medium text-primary">Backend target</p>
            <p className="mt-1 break-all">{apiBaseUrl}</p>
            <p className="mt-3">
              The token is never baked into the frontend bundle. The app exchanges it
              for an HttpOnly session cookie on the backend domain.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
