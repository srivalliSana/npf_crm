import React from 'react'

const SIZES = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-12 h-12 text-sm' }

function initials(name = '') {
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Avatar({ src, name, size = 'md', className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} rounded-full object-cover border border-gray-200 ${className}`}
      />
    )
  }
  return (
    <div className={`${SIZES[size]} rounded-full bg-primary-500 text-white font-bold flex items-center justify-center flex-shrink-0 ${className}`}>
      {initials(name) || '?'}
    </div>
  )
}
