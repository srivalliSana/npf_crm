import React, { forwardRef } from 'react'

const Textarea = forwardRef(function Textarea({ label, error, className = '', containerClassName = '', ...rest }, ref) {
  return (
    <div className={containerClassName}>
      {label && <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>}
      <textarea
        ref={ref}
        className={`input-field resize-none ${error ? 'border-danger-500 focus:ring-danger-400' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  )
})

export default Textarea
