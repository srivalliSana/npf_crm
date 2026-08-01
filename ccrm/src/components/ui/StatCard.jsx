import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const TONE = {
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger:  'bg-danger-100 text-danger-700',
  info:    'bg-info-100 text-info-700',
  neutral: 'bg-gray-100 text-gray-600',
}

// Standardizes the KPI-tile pattern used across Dashboard/Reports/etc so
// they stop each re-implementing their own card+icon+number layout.
export default function StatCard({ icon: Icon, label, value, tone = 'primary', trend, className = '' }) {
  return (
    <div className={`card p-5 flex items-center gap-3.5 hover:shadow-cardHover ${className}`}>
      {Icon && (
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${TONE[tone] || TONE.primary}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <div className="text-2xl font-extrabold text-gray-900 leading-tight tracking-tight truncate">{value}</div>
          {trend != null && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trend >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 font-medium truncate mt-0.5">{label}</div>
      </div>
    </div>
  )
}
