import React from 'react'

// A ledger-style KPI block: one container split by hairlines, label over figure.
// The first item leads (larger); the rest are siblings. No icons, no tiles.
// items: [{ label, value }]
export default function KpiStrip({ items = [], className = '' }) {
  const [lead, ...rest] = items
  if (!lead) return null
  return (
    <div className={`card grid grid-cols-1 lg:grid-cols-[minmax(200px,260px)_1fr] ${className}`}>
      <div className="p-5">
        <div className="text-[13px] text-gray-500">{lead.label}</div>
        <div className="text-[34px] leading-none font-medium text-gray-900 mt-2 tabular-nums tracking-tight">{lead.value}</div>
      </div>
      <div className="overflow-hidden"><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 -mt-px -ml-px lg:-mt-px">
        {rest.map((it) => (
          <div key={it.label} className="px-5 py-4 border-t border-l border-gray-200">
            <div className="text-[13px] text-gray-500 truncate">{it.label}</div>
            <div className="text-[20px] font-medium text-gray-900 mt-1 tabular-nums">{it.value}</div>
          </div>
        ))}
      </div></div>
    </div>
  )
}
