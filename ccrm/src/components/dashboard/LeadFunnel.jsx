import React from 'react'
import { Card } from '../ui'

// Horizontal bar funnel, plain markup, no chart library. `stages`:
// [{ label, value }]. Bars are one hue (the data blue), scaled to the first
// stage so the shape reads as a funnel. A zero draws no bar: no stub.
// (The `tone` field is accepted for compatibility but no longer changes colour.)
export default function LeadFunnel({ stages }) {
  const top = Math.max(...stages.map(s => s.value || 0), 1)
  return (
    <Card className="p-5 mb-6">
      <div className="text-base font-medium text-gray-900 mb-4">Admissions funnel</div>
      <div className="space-y-2.5">
        {stages.map(s => {
          const pct = Math.round(((s.value || 0) / top) * 100)
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-40 flex-shrink-0 text-[14px] text-gray-600 truncate">{s.label}</span>
              <div className="flex-1 h-2 rounded-sm bg-gray-100 overflow-hidden">
                <div className="h-full rounded-sm bg-data-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-14 flex-shrink-0 text-right text-[14px] font-medium text-gray-900 tabular-nums">
                {(s.value || 0).toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
