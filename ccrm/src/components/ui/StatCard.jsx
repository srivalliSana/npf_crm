import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

// Icon colour only, no tinted tile behind it. Colour belongs on data, not chrome.
const TONE = {
  primary: 'text-primary-600',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger:  'text-danger-700',
  info:    'text-info-700',
  neutral: 'text-gray-500',
  ai:      'text-ai-600',
}

// Standardizes the KPI pattern used across Dashboard/Reports/etc.
// Label on top, the figure as type underneath, trend as a plain number.
export default function StatCard({ icon: Icon, label, value, tone = 'primary', trend, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center gap-2 text-[13px] text-gray-500 font-medium min-w-0">
        {Icon && <Icon size={15} strokeWidth={1.8} className={`flex-shrink-0 ${TONE[tone] || TONE.primary}`} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <div className="text-[26px] font-semibold text-gray-900 leading-tight tracking-tight truncate tabular-nums">{value}</div>
        {trend != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${trend >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}
