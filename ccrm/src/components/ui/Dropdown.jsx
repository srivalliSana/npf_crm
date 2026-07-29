import React, { useState, useRef, useEffect } from 'react'

const ALIGN = { left: 'left-0', right: 'right-0' }

// Generic trigger + floating panel. `trigger` is a render prop receiving
// { open, toggle } so callers can style their own trigger button/icon.
export default function Dropdown({ trigger, children, align = 'right', panelClassName = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && (
        <div className={`absolute ${ALIGN[align]} top-full mt-2 min-w-[180px] bg-white rounded-xl border border-gray-200 shadow-dropdown z-50 py-1.5 animate-scale-up ${panelClassName}`}>
          {children}
        </div>
      )}
    </div>
  )
}

Dropdown.Item = function DropdownItem({ children, icon: Icon, danger = false, className = '', ...rest }) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors ${danger ? 'text-danger-600 hover:bg-danger-50' : 'text-gray-700 hover:bg-gray-50'} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  )
}
