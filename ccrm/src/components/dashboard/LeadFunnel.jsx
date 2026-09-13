import React from 'react'
import { Card } from '../ui'

// Static class map — Tailwind's JIT compiler only generates classes that
// appear literally in source, so `bg-${tone}-500` string interpolation
// would silently produce no CSS. This map is the fix.
const BAR_TONE = {
  primary: 'bg-primary-500',
  info:    'bg-info-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger:  'bg-danger-500',
  accent:  'bg-accent-500',
}

// Horizontal bar funnel — plain Tailwind, no chart library. `stages`:
// [{ label, value, tone }]. Each bar's width is relative to the first
// stage's value (the top of the funnel), so the shape reads as a real funnel
// even when the absolute numbers are small.
export default function LeadFunnel({ stages }) {
  const top = stages[0]?.value || 1
  return (
    <Card className="p-5 mb-6">
      <div className="text-sm font-bold text-gray-800 mb-4">Admissions Funnel</div>
      <div className="space-y-2.5">
        {stages.map(s => {
          const pct = Math.max(4, Math.round((s.value / top) * 100))
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-40 flex-shrink-0 text-xs text-gray-500 truncate">{s.label}</span>
              <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${BAR_TONE[s.tone] || BAR_TONE.primary}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-14 flex-shrink-0 text-right text-xs font-bold text-gray-800 font-mono">
                {(s.value || 0).toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
