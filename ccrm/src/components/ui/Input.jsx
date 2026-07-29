import React, { forwardRef } from 'react'

const Input = forwardRef(function Input({ label, error, icon: Icon, className = '', containerClassName = '', ...rest }, ref) {
  return (
    <div className={containerClassName}>
      {label && <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>}
      <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />}
        <input
          ref={ref}
          className={`input-field ${Icon ? 'pl-9' : ''} ${error ? 'border-danger-500 focus:ring-danger-400' : ''} ${className}`}
          {...rest}
        />
      </div>
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  )
})

export default Input
