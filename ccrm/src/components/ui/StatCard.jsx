import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const TONE = {
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger:  'bg-danger-50 text-danger-700',
  info:    'bg-info-50 text-info-700',
  neutral: 'bg-gray-100 text-gray-600',
}

// Standardizes the KPI-tile pattern used across Dashboard/Reports/etc so
// they stop each re-implementing their own card+icon+number layout.
export default function StatCard({ icon: Icon, label, value, tone = 'primary', trend, className = '' }) {
  return (
    <div className={`card p-4 flex items-center gap-3 ${className}`}>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE[tone] || TONE.primary}`}>
          <Icon size={19} />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <div className="text-xl font-extrabold text-gray-900 leading-tight truncate">{value}</div>
          {trend != null && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trend >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 truncate">{label}</div>
      </div>
    </div>
  )
}
