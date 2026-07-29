import React, { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

const Select = forwardRef(function Select({ label, error, options, placeholder, className = '', containerClassName = '', children, ...rest }, ref) {
  return (
    <div className={containerClassName}>
      {label && <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          className={`input-field appearance-none pr-8 cursor-pointer ${error ? 'border-danger-500 focus:ring-danger-400' : ''} ${className}`}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options ? options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          )) : children}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  )
})

export default Select
