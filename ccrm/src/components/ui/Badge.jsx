import React from 'react'

const VARIANT_CLASS = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge bg-primary-100 text-primary-700',
  ai:      'badge-ai',
  accent:  'badge-accent',
}

// Generic status pill built on the semantic color tokens — meant to replace
// the 17+ per-page STAGE_COLORS/STATUS_COLORS/ROLE_COLORS-style lookup
// objects. Pages that need a specific stage/status string mapped to a
// variant keep a small local map of *variant names only* (e.g.
// { Active: 'success', Suspended: 'danger' }), not full className strings.
// `dot` prepends a small filled circle in the badge's own color — used for
// stage/status pills where a glanceable indicator matters more than for a
// plain count or label badge.
export default function Badge({ variant = 'neutral', dot = false, children, className = '' }) {
  const base = VARIANT_CLASS[variant] || VARIANT_CLASS.neutral
  return <span className={`${base}${dot ? ' badge-dot' : ''} ${className}`}>{children}</span>
}
