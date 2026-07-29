import React from 'react'

const VARIANTS = {
  text:   'h-3.5 rounded',
  circle: 'rounded-full',
  rect:   'rounded-lg',
}

// Replaces the ad-hoc animate-spin spinners scattered across every page
// with a consistent shimmer placeholder shaped like the content it stands in for.
export default function Skeleton({ variant = 'text', className = '', count = 1 }) {
  const item = (i) => (
    <div key={i} className={`animate-pulse bg-gray-200 ${VARIANTS[variant]} ${className}`} />
  )
  if (count === 1) return item(0)
  return <div className="space-y-2">{Array.from({ length: count }, (_, i) => item(i))}</div>
}

// Ready-made skeleton for a table's <tbody> while data loads.
Skeleton.TableRows = function SkeletonTableRows({ columns = 5, rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b border-gray-100">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-3 py-3.5">
              <Skeleton variant="text" className="w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
