import React from 'react'

// Layout primitive for a "detail workspace" — a narrow info sidebar, an
// optional wide scrollable center column, and a narrow right-side panel
// (e.g. the AI Assistant). Pure layout, no business logic: callers pass
// fully-built JSX into each slot. Stacks to full width below the `xl`
// breakpoint. Omit `center` for a plain 2-column left+right layout (the
// middle column is skipped entirely rather than rendered empty, so left and
// right sit directly adjacent instead of being pushed apart by a blank gap).
export default function Workspace3Col({ left, center, right, className = '' }) {
  return (
    <div className={`flex flex-col xl:flex-row gap-5 items-start ${className}`}>
      <div className="w-full xl:w-[230px] xl:flex-shrink-0 space-y-4">{left}</div>
      {center != null && <div className="flex-1 min-w-0 space-y-4">{center}</div>}
      <div className="w-full xl:w-[300px] xl:flex-shrink-0 space-y-4">{right}</div>
    </div>
  )
}
