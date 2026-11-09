import React from 'react'

// Shared page shell every migrated page adopts: consistent outer padding
// plus an optional header block (title/description/primary action), so
// pages stop hand-rolling their own header row with slightly different
// spacing/typography each time.
export default function PageContainer({ title, description, action, children, className = '' }) {
  return (
    <div className={`p-6 ${className}`}>
      {(title || action) && (
        <div className="page-band">
          <div>
            {title && <h1 className="page-band-title">{title}</h1>}
            {description && <p className="page-band-desc">{description}</p>}
          </div>
          {action && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
