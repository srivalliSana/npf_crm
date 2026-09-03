import React, { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
}

// Centralizes the overlay/card/header pattern that was hand-rolled 20+
// times across pages (LeadManager alone had 9 separate copies).
export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-lg w-full ${SIZES[size] || SIZES.md} overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div>
              {title && <h2 className="font-bold text-gray-900 text-base">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && <div className="flex gap-3 px-6 pb-6">{footer}</div>}
      </div>
    </div>
  )
}
