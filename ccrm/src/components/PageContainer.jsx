import React from 'react'

// Shared page shell every migrated page adopts: consistent outer padding
// plus an optional header block (title/description/primary action), so
// pages stop hand-rolling their own header row with slightly different
// spacing/typography each time.
export default function PageContainer({ title, description, action, children, className = '' }) {
  return (
    <div className={`p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            {title && <h1 className="text-xl font-bold text-gray-900">{title}</h1>}
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
