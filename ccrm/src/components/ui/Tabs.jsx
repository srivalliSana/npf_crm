import React from 'react'

// Controlled horizontal tab bar. `tabs`: [{ id, label, icon? }]. Content
// rendering stays with the caller — this only owns the tab strip UI.
export default function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`flex items-center gap-1 border-b border-gray-200 ${className}`}>
      {tabs.map(t => {
        const Icon = t.icon
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
            }`}
          >
            {Icon && <Icon size={14} />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
