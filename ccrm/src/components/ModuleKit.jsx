import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertTriangle, RefreshCw, PlugZap } from 'lucide-react'
import { Card, EmptyState, Button } from './ui'

// Pieces the Analytics / Compliance / Integration / Security pages all need.
// Kept separate from components/ui so the shared primitives stay generic.

// ── Async data with loading / error / retry, cancelled on unmount ────────────
export function useAsync(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  // The fetcher is usually an inline arrow, so it changes identity every
  // render; keeping it in a ref lets `deps` alone decide when to refetch.
  const fnRef = useRef(fetcher)
  fnRef.current = fetcher
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    Promise.resolve()
      .then(() => fnRef.current())
      .then(data => { if (alive) setState({ data, loading: false, error: null }) })
      .catch(err => { if (alive) setState({ data: null, loading: false, error: err.message || 'Request failed.' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce(n => n + 1), [])
  return { ...state, reload }
}

// ── Panel: a titled card ─────────────────────────────────────────────────────
export function Panel({ title, subtitle, action, children, className = '', bodyClass = '' }) {
  return (
    <Card className={className}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </Card>
  )
}

// ── Uniform loading / error states ──────────────────────────────────────────
export function Loading({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-16 text-sm text-gray-400 ${className}`}>
      <RefreshCw size={15} className="animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Couldn't load this"
      description={error}
      action={onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>Try again</Button>}
    />
  )
}

// Shown when a dashboard's source table is still empty. Deliberately distinct
// from an error and from a zero value — "nothing has been synced yet" is a
// different fact from "the answer is zero".
export function NotConfigured({ title, description, action }) {
  return <EmptyState icon={PlugZap} title={title} description={description} action={action} />
}

// ── Horizontal bar list ─────────────────────────────────────────────────────
// The recurring "label · bar · value" row used across all four dashboards.
export function BarList({ items, valueKey = 'value', labelKey = 'label', format = (v) => v, color = 'bg-primary-500', empty = 'No data yet.' }) {
  if (!items?.length) return <p className="text-sm text-gray-400 py-6 text-center">{empty}</p>
  const max = Math.max(...items.map(i => Number(i[valueKey]) || 0), 1)
  return (
    <div className="space-y-2.5">
      {items.map((it, idx) => (
        <div key={it[labelKey] ?? idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 font-medium w-40 flex-shrink-0 truncate" title={String(it[labelKey])}>
            {it[labelKey]}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[40px]">
            <div
              className={`${it.color || color} h-2 rounded-full transition-all duration-500`}
              style={{ width: `${((Number(it[valueKey]) || 0) / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-gray-700 w-20 text-right flex-shrink-0">
            {format(it[valueKey])}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Funnel: stages with the survival rate between them ──────────────────────
export function Funnel({ stages }) {
  const top = Math.max(stages[0]?.value || 0, 1)
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null
        const dropPct = prev > 0 ? Math.round((s.value / prev) * 100) : null
        return (
          <div key={s.label}>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 font-medium w-36 flex-shrink-0">{s.label}</span>
              <div className="flex-1 bg-gray-100 rounded-lg h-7 min-w-[60px] relative overflow-hidden">
                <div
                  className={`${s.color || 'bg-primary-500'} h-7 rounded-lg transition-all duration-500 flex items-center px-2`}
                  style={{ width: `${Math.max(((s.value || 0) / top) * 100, 2)}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-white mix-blend-luminosity">
                  {(s.value ?? 0).toLocaleString('en-IN')}
                </span>
              </div>
              <span className="text-[11px] text-gray-400 w-12 text-right flex-shrink-0">
                {dropPct == null ? '' : `${dropPct}%`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Scroll container for wide tables (item 28) ──────────────────────────────
// A table that would otherwise force the whole page to scroll sideways on a
// phone scrolls inside its own box instead.
export function ScrollX({ children, className = '' }) {
  return <div className={`overflow-x-auto -mx-5 px-5 ${className}`}>{children}</div>
}

// ── Segmented control ───────────────────────────────────────────────────────
export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex bg-gray-100 rounded-lg p-0.5 overflow-x-auto ${className}`}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
            value === o.value ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
