import React from 'react'

const VARIANTS = {
  primary:     'bg-primary-500 hover:bg-primary-600 text-white shadow-card hover:shadow-cardHover disabled:bg-primary-300 disabled:shadow-none',
  secondary:   'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-soft disabled:text-gray-400 disabled:shadow-none',
  destructive: 'bg-danger-500 hover:bg-danger-600 text-white shadow-card hover:shadow-cardHover disabled:bg-danger-300 disabled:shadow-none',
  ghost:       'bg-transparent hover:bg-gray-100 text-gray-600 disabled:text-gray-300',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-sm px-5 py-2.5 gap-2',
}

// Shared button primitive — replaces the 249+ one-off inline button
// classNames scattered across pages. `variant`/`size` cover every case
// found in the audit (primary, secondary/outline, destructive/red, icon-only ghost).
export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 13 : 15} />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 13 : 15} />}
    </button>
  )
}
