import React from 'react'

const POSITION = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

// Lightweight CSS-only tooltip (no positioning library) — wraps a trigger
// element and shows a small dark label on hover/focus.
export default function Tooltip({ content, children, position = 'top', className = '' }) {
  return (
    <span className={`relative inline-flex group ${className}`}>
      {children}
      <span
        className={`pointer-events-none absolute ${POSITION[position]} z-50 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 scale-95 transition-all duration-100 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100`}
      >
        {content}
      </span>
    </span>
  )
}
