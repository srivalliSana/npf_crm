import React from 'react'

const VARIANT_CLASS = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge bg-primary-100 text-primary-700',
}

// Generic status pill built on the semantic color tokens — meant to replace
// the 17+ per-page STAGE_COLORS/STATUS_COLORS/ROLE_COLORS-style lookup
// objects. Pages that need a specific stage/status string mapped to a
// variant keep a small local map of *variant names only* (e.g.
// { Active: 'success', Suspended: 'danger' }), not full className strings.
export default function Badge({ variant = 'neutral', children, className = '' }) {
  return <span className={`${VARIANT_CLASS[variant] || VARIANT_CLASS.neutral} ${className}`}>{children}</span>
}
