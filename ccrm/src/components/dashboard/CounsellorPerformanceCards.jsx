import React from 'react'
import { Card } from '../ui'

// One card per counsellor, joining the already-fetched `byCounsellor`
// summary with `byCounsellorStages` (the same matrix Dashboard's Stage
// Summary table uses) to get each counsellor's "Payment Success" count for
// a conversion-rate figure — no new endpoint or query.
export default function CounsellorPerformanceCards({ byCounsellor, byCounsellorStages }) {
  if (!byCounsellor?.length) return null
  const stagesByName = Object.fromEntries((byCounsellorStages || []).map(r => [r.counsellor, r]))

  return (
    <Card className="p-5 mb-6">
      <div className="text-sm font-bold text-gray-800 mb-4">Counsellor Performance</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {byCounsellor.map(c => {
          const won = stagesByName[c.name]?.stages?.['Payment Success'] || 0
          const leads = c.leads || 0
          const conversionRate = leads > 0 ? Math.round((won / leads) * 100) : 0
          const initials = (c.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
          return (
            <div key={c.name} className="rounded-xl border border-gray-100 p-3.5 bg-gray-50/60">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-8 h-8 rounded-full bg-ai-100 text-ai-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-gray-800 truncate">{c.name}</div>
                  <div className="text-[10.5px] text-gray-400">{won} converted</div>
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                <span>Leads worked</span>
                <span className="font-mono font-semibold text-gray-700">{c.interested || 0}/{leads}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, conversionRate)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
